// Thin price endpoint kept for compatibility. The real lookup is the same dynamic
// TCGGO-by-code+number flow used by /api/tcggo-debug. No internal set database.
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
export default async function handler(req,res){
  const q=req.method==='POST'?(req.body||{}):(req.query||{});
  const code=clean(q.code||q.setCode).toUpperCase(),number=clean(q.number||q.localId).split('/')[0].trim(),lang=clean(q.lang||q.language||'es').toLowerCase();
  const params=new URLSearchParams({code,number,lang,nameEnglish:clean(q.nameEnglish||q.cardmarketNameEnglish||''),name:clean(q.name||''),setName:clean(q.setName||q.expansion||q.set||'')});
  try{
    const base=`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`;
    const r=await fetch(`${base}/api/tcggo-debug?${params}`,{headers:{accept:'application/json'},cache:'no-store'});
    const j=await r.json();
    if(!j?.ok)return res.status(502).json({ok:false,error:j?.steps?.find(s=>s.status==='ERROR')?.detail||'No se encontró precio TCGGO.',steps:j?.steps||[]});
    const result=(j.steps||[]).find(s=>s.step==='10. Resultado');
    const price=Number(result?.data?.price);
    if(!Number.isFinite(price))return res.status(502).json({ok:false,error:'TCGGO no devolvió un precio válido.',steps:j.steps||[]});
    return res.status(200).json({ok:true,price,priceDisplay:price.toFixed(2).replace('.',',')+' €',source:'TCGGO',language:lang,steps:j.steps,url:result?.data?.url||''});
  }catch(e){return res.status(500).json({ok:false,error:e?.message||'Error consultando TCGGO.'});}
}
