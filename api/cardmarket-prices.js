const LANGUAGES={
  'Inglés':'english',
  'Español':'spanish',
  'Japonés':'japanese',
  'Francés':'french',
  'Alemán':'german',
  'Italiano':'italian',
  'Portugués':'portuguese',
  'Coreano':'korean'
};

function getProductId(req){
  const direct=String(req.query?.productId||'').trim();
  if(/^\d+$/.test(direct)) return direct;
  const raw=String(req.query?.url||'').trim();
  if(!raw) return '';
  try{
    const u=new URL(raw);
    const id=u.searchParams.get('idProduct');
    return /^\d+$/.test(String(id||''))?String(id):'';
  }catch(_){return '';}
}

function languageFor(raw){
  const s=String(raw||'Inglés').trim();
  return LANGUAGES[s]||'english';
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET') return res.status(405).json({ok:false,error:'Método no permitido'});

    const apiKey=String(process.env.CM_API_KEY||'').trim();
    if(!apiKey){
      return res.status(500).json({ok:false,error:'Falta configurar CM_API_KEY en las variables de entorno de Vercel.'});
    }

    const productId=getProductId(req);
    if(!productId){
      return res.status(400).json({ok:false,error:'Falta el idProduct de Cardmarket.'});
    }

    const langLabel=String(req.query?.lang||'Inglés').trim();
    const language=languageFor(langLabel);

    // Para esta primera integración PokeScan consulta únicamente NM (Near Mint o mejor).
    // La API aplica el idioma y la condición en origen y devuelve prices.from como
    // el anuncio más barato que coincide con ambos filtros.
    const apiUrl=new URL(`https://cardmarketapi.com/api/v1/card/${encodeURIComponent(productId)}`);
    apiUrl.searchParams.set('language',language);
    apiUrl.searchParams.set('condition','nm');

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    let r;
    try{
      r=await fetch(apiUrl.toString(),{
        method:'GET',
        headers:{'X-API-Key':apiKey,'accept':'application/json'},
        cache:'no-store',
        signal:controller.signal
      });
    }finally{
      clearTimeout(timeout);
    }
    const body=await r.text();
    let data=null;
    try{data=JSON.parse(body);}catch(_){data=null;}

    if(!r.ok){
      return res.status(r.status===429?429:502).json({
        ok:false,
        error:data?.error||`Cardmarket API respondió HTTP ${r.status}`,
        upstreamStatus:r.status
      });
    }

    const value=Number(data?.prices?.from);
    const price=Number.isFinite(value)?value:null;

    return res.status(200).json({
      ok:true,
      productId,
      language:langLabel,
      languageApi:language,
      condition:'NM',
      price,
      // El frontend trabaja con un mapa por estado. Esta primera versión consulta
      // únicamente NM, así que devolvemos el precio bajo la clave NM.
      prices: price==null ? {} : {NM: price},
      priceField:'prices.from',
      fetchedAt:data?.fetched_at||null,
      available:Number.isFinite(Number(data?.prices?.available))?Number(data.prices.available):null,
      source:data?.source||'cardmarket-live'
    });
  }catch(e){
    if(e?.name==='AbortError'){
      return res.status(504).json({ok:false,error:'Cardmarket API tardó más de 15 segundos.'});
    }
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Cardmarket API')});
  }
}
