function cleanText(html){
  return String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/&#x27;/gi,"'")
    .replace(/&#x20;/gi,' ')
    .replace(/&euro;/gi,'€')
    .replace(/&#8364;/gi,'€')
    .replace(/\s+/g,' ')
    .trim();
}

function parseFirstOfferPrice(html){
  const text=cleanText(html);
  // Cardmarket's product page displays the cheapest available offer after
  // "From" (or the localized equivalent). Offers are ordered cheapest first.
  const m=text.match(/\b(?:From|Desde|Ab)\s+(\d+(?:[.,]\d{1,2})?)\s*€/i);
  if(!m)return null;
  const n=Number(String(m[1]).replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}

function isAllowedCardmarketUrl(raw){
  try{
    const u=new URL(String(raw||''));
    const host=u.hostname.toLowerCase();
    return (host==='cardmarket.com'||host.endsWith('.cardmarket.com')) &&
           /\/Pokemon\//i.test(u.pathname);
  }catch(e){return false}
}

function withLanguage(raw){
  const u=new URL(raw);
  // Preserve the product URL and its existing language filter. If absent,
  // add the same language ids used by PokeScan.
  if(!u.searchParams.has('language')&&!u.searchParams.has('idLanguage')){
    const lang=(u.searchParams.get('lang')||'').toLowerCase();
    const id=lang==='es'||lang==='spanish'||lang==='español'?'4':'1';
    u.searchParams.set('language',id);
    u.searchParams.set('idLanguage',id);
  }
  return u.toString();
}

async function fetchCardmarket(url){
  const r=await fetch(url,{
    method:'GET',
    redirect:'follow',
    headers:{
      'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language':'es-ES,es;q=0.9,en;q=0.8',
      'cache-control':'no-cache'
    }
  });
  const body=await r.text();
  if(!r.ok)throw new Error('Cardmarket respondió HTTP '+r.status);
  return body;
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método no permitido'});
    const raw=String(req.query?.url||'').trim();
    if(!raw||!isAllowedCardmarketUrl(raw)){
      return res.status(400).json({ok:false,error:'URL de Cardmarket no válida'});
    }
    const url=withLanguage(raw);
    const html=await fetchCardmarket(url);
    const price=parseFirstOfferPrice(html);
    if(price===null){
      return res.status(404).json({ok:false,error:'No hay ninguna oferta disponible en este producto'});
    }
    return res.status(200).json({ok:true,price,url});
  }catch(e){
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Cardmarket')});
  }
}
