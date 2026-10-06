function cleanText(html){
  return String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&euro;/gi,'€')
    .replace(/&#8364;/gi,'€').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"')
    .replace(/\s+/g,' ').trim();
}
function priceNumber(s){
  const n=Number(String(s).replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,''));
  return Number.isFinite(n)?n:null;
}
function parseFirstNmPrice(html){
  const text=cleanText(html);
  // Cardmarket offer rows normally expose condition first, then quantity and price.
  // We deliberately look for NM/Near Mint and the first EUR amount immediately after it.
  const patterns=[
    /\bNM\b\s+(?:\d+\s+)?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*€/ig,
    /\bNear Mint\b\s+(?:\d+\s+)?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*€/ig,
    /\bNM\b[\s\S]{0,80}?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*€/ig,
    /\bNear Mint\b[\s\S]{0,80}?(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*€/ig
  ];
  let best=null;
  for(const re of patterns){
    const m=re.exec(text);
    if(m){ const p=priceNumber(m[1]); if(p!==null){best=p;break;} }
  }
  return best;
}
function isAllowedCardmarketUrl(raw){
  try{const u=new URL(String(raw||'')); return (u.hostname==='cardmarket.com'||u.hostname.endsWith('.cardmarket.com')) && /\/Pokemon\//i.test(u.pathname);}
  catch(e){return false;}
}
async function fetchCardmarket(url){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  try{
    const r=await fetch(url,{method:'GET',redirect:'follow',headers:{'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'es-ES,es;q=0.9,en;q=0.8'},signal:controller.signal});
    const body=await r.text();
    if(!r.ok){
      const err=new Error('Cardmarket respondió HTTP '+r.status); err.status=r.status; throw err;
    }
    return body;
  }finally{clearTimeout(timer);}
}
export default async function handler(req,res){
  try{
    if(req.method!=='GET') return res.status(405).json({ok:false,error:'Método no permitido'});
    const url=String(req.query?.url||'').trim();
    if(!url||!isAllowedCardmarketUrl(url)) return res.status(400).json({ok:false,error:'URL de Cardmarket no válida'});
    const html=await fetchCardmarket(url);
    if(/cloudflare|just a moment|cf-chl-|challenge-platform/i.test(html)) return res.status(424).json({ok:false,error:'Cardmarket ha mostrado una protección anti-bot; no se pudo leer la página automáticamente.',blocked:true});
    const price=parseFirstNmPrice(html);
    if(price===null) return res.status(404).json({ok:false,error:'No se encontró una oferta NM en la página.',blocked:false});
    return res.status(200).json({ok:true,price,source:'cardmarket-page',url});
  }catch(e){
    if(e?.name==='AbortError') return res.status(504).json({ok:false,error:'Cardmarket tardó más de 15 segundos.',timeout:true});
    if(e?.status===403||e?.status===429) return res.status(424).json({ok:false,error:'Cardmarket rechazó la consulta automática (HTTP '+e.status+').',blocked:true,status:e.status});
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Cardmarket')});
  }
}
