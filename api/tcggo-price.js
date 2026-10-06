function decodeHtml(s){
  return String(s||'')
    .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;|&#x22;/gi,'"')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function stripHtml(s){return decodeHtml(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function norm(s){return String(s||'').replace(/\s+/g,' ').trim();}
function normalizeQuery(code, number){
  const c=String(code||'').trim().toUpperCase();
  const raw=String(number||'').split('/')[0].trim();
  if(!c||!raw)return '';
  const n=(c==='MEP'||c==='SVP') ? raw.padStart(3,'0') : raw;
  return c+' '+n;
}
function absoluteUrl(href){
  try{return new URL(decodeHtml(href),'https://www.tcggo.com').toString()}catch(e){return ''}
}
function firstCardLinks(html){
  const out=[]; const seen=new Set();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const url=absoluteUrl(m[1]);
    if(!url)continue;
    const u=new URL(url);
    const p=u.pathname.replace(/\/+$/,'');
    if(!/^\/pokemon(?:-jp)?\/[^/]+\/[^/]+$/i.test(p))continue;
    const parts=p.split('/').filter(Boolean);
    if(['singles','products','product','episodes','episode','cards','sets'].includes(parts[1].toLowerCase()))continue;
    if(seen.has(url))continue;
    seen.add(url);
    out.push({url,text:stripHtml(m[2])});
  }
  return out;
}
function extractMeta(html,name){
  const re=new RegExp('<meta[^>]+(?:property|name)=["\\\']'+name.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\']','i');
  const m=html.match(re); return m?decodeHtml(m[1]):'';
}
function extractTitle(html){
  const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m?stripHtml(m[1]):'';
}
function priceRows(html){
  // TCGGO renders the EU Prices table in the card page. We deliberately keep
  // this parser broad: it records language + Europe + numeric EUR values and
  // lets the caller choose the requested language.
  const text=stripHtml(html).replace(/\u00a0/g,' ');
  const rows=[];
  const languages=['English','German','French','Spanish','Italian','Japanese','Korean','Chinese','Portuguese'];
  for(const lang of languages){
    const re=new RegExp(lang+'\\s+Europe\\s+([0-9]+(?:[.,][0-9]+)?)\\s*€','i');
    const m=text.match(re);
    if(m)rows.push({language:lang,market:'Europe',price:Number(String(m[1]).replace(',','.')),display:m[1].replace('.',',')+' €'});
  }
  return rows;
}
function wantedLanguage(lang){
  const x=String(lang||'').toLowerCase();
  if(x.includes('japon'))return 'Japanese';
  if(x.includes('ingl'))return 'English';
  if(x.includes('españ')||x.includes('espana')||x.includes('span'))return 'Spanish';
  if(x.includes('franc'))return 'French';
  if(x.includes('alem'))return 'German';
  if(x.includes('ital'))return 'Italian';
  if(x.includes('core'))return 'Korean';
  if(x.includes('chin'))return 'Chinese';
  return 'English';
}
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const debug=[];
  const step=(name,extra={})=>debug.push({name,...extra});
  try{
    const body=req.body||{};
    const code=String(body.code||'').trim().toUpperCase();
    const number=String(body.number||'').trim();
    const language=String(body.language||'Español').trim();
    const query=normalizeQuery(code,number);
    if(!query)return res.status(400).json({ok:false,error:'Faltan código y número.',debug});

    const searchUrl='https://www.tcggo.com/pokemon?search='+encodeURIComponent(query);
    step('1. Buscador principal TCGGO',{query,searchUrl});
    const sr=await fetch(searchUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml,text/html'},cache:'no-store'});
    step('2. Respuesta del buscador',{status:sr.status,ok:sr.ok});
    if(!sr.ok)throw new Error('TCGGO respondió HTTP '+sr.status);
    const searchHtml=await sr.text();
    const links=firstCardLinks(searchHtml);
    step('3. Cartas encontradas',{count:links.length,first:links[0]||null});
    if(!links.length)throw new Error('El buscador principal no devolvió ninguna carta.');

    const cardUrl=links[0].url;
    step('4. Primera carta seleccionada',{url:cardUrl,title:links[0].text||''});
    const cr=await fetch(cardUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml,text/html'},cache:'no-store'});
    step('5. Respuesta de la ficha',{status:cr.status,ok:cr.ok});
    if(!cr.ok)throw new Error('La ficha de TCGGO respondió HTTP '+cr.status);
    const cardHtml=await cr.text();
    const title=extractTitle(cardHtml)||extractMeta(cardHtml,'og:title');
    const prices=priceRows(cardHtml);
    const wanted=wantedLanguage(language);
    const selected=prices.find(x=>x.language===wanted)||prices[0]||null;
    step('6. Precios EU encontrados',{prices,wantedLanguage:wanted,selected});
    if(!selected)throw new Error('No se encontró ningún precio Europe en la ficha de TCGGO.');
    return res.status(200).json({ok:true,query,searchUrl,cardUrl,title,firstResult:links[0],prices,selected,debug});
  }catch(e){
    step('ERROR',{message:e?.message||String(e)});
    return res.status(200).json({ok:false,error:e?.message||'Error consultando TCGGO',debug});
  }
};
