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

const CONDITIONS=['MT','NM','EX','GD','LP','PL','PO'];

function languageId(raw){
  const s=String(raw||'').trim();
  const map={Español:4,Inglés:1,Japonés:7,Francés:2,Alemán:3,Italiano:5,Portugués:8,Coreano:10,
    ES:4,EN:1,JA:7,JP:7,FR:2,DE:3,IT:5,PT:8,KO:10};
  return map[s]||1;
}

function withFilters(raw, lang){
  const u=new URL(String(raw));
  const id=languageId(lang);
  u.searchParams.set('language',String(id));
  u.searchParams.set('idLanguage',String(id));
  return u.toString();
}

function parseConditionPrices(html){
  const text=cleanText(html);
  const prices={};
  // Cardmarket lists each offer as: seller -> condition -> quantity -> price.
  // Looking for that local pattern avoids treating words such as "near mint"
  // inside seller comments as an offer condition.
  const re=/\b(MT|NM|EX|GD|LP|PL|PO)\b\s+(\d{1,4})\s+(\d{1,6}(?:[.,]\d{1,2})?)\s*€/gi;
  let m;
  while((m=re.exec(text))){
    const condition=String(m[1]).toUpperCase();
    const value=Number(String(m[2]+'').replace(/\./g,'').replace(',','.'));
    // The first number is the quantity, so the price is m[3].
    const price=Number(String(m[3]).replace(/\./g,'').replace(',','.'));
    if(!Number.isFinite(price)) continue;
    if(prices[condition]==null || price<prices[condition]) prices[condition]=price;
  }
  return prices;
}

async function fetchCardmarket(url){
  const r=await fetch(url,{method:'GET',redirect:'follow',headers:{
    'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'es-ES,es;q=0.9,en;q=0.8',
    'cache-control':'no-cache'
  }});
  const body=await r.text();
  if(!r.ok)throw new Error('Cardmarket respondió HTTP '+r.status);
  return body;
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método no permitido'});
    const raw=String(req.query?.url||'').trim();
    const productId=String(req.query?.productId||'').trim();
    const lang=String(req.query?.lang||'Inglés').trim();
    let url=raw;
    if(!url && /^\d+$/.test(productId)){
      url='https://www.cardmarket.com/es/Pokemon/Products?idProduct='+encodeURIComponent(productId);
    }
    if(!url) return res.status(400).json({ok:false,error:'Falta la carta de Cardmarket.'});
    const filtered=withFilters(url,lang);
    const html=await fetchCardmarket(filtered);
    const prices=parseConditionPrices(html);
    const count=Object.keys(prices).length;
    if(!count)return res.status(404).json({ok:false,error:'No se encontraron precios por estado en Cardmarket.'});
    return res.status(200).json({ok:true,prices,language:lang,productId,url:filtered,conditions:CONDITIONS});
  }catch(e){
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Cardmarket')});
  }
}
