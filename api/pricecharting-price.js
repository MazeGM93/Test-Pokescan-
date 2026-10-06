const SET_SLUGS={
  'Destined Rivals':'destined-rivals','Rivales Predestinados':'destined-rivals',
  'Phantasmal Flames':'phantasmal-flames','Llamas Fantasmales':'phantasmal-flames',
  'Mega Evolution':'mega-evolution','Megaevolución':'mega-evolution',
  'Perfect Order':'perfect-order','Equilibrio Perfecto':'perfect-order',
  'Chaos Rising':'chaos-rising','Caos Creciente':'chaos-rising',
  'Pitch Black':'pitch-black','Oscuridad Absoluta':'pitch-black',
  'Journey Together':'journey-together','Juntos de Aventuras':'journey-together',
  'Prismatic Evolutions':'prismatic-evolutions','Evoluciones Prismáticas':'prismatic-evolutions',
  '151':'151','Scarlet & Violet':'scarlet-violet','Evolutions':'evolutions',
  'Base Set':'base-set','Team Rocket':'team-rocket','Crown Zenith':'crown-zenith'
};
function slugify(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function setSlug(set){return SET_SLUGS[String(set||'').trim()]||slugify(set)}
function numOnly(n){const m=String(n||'').match(/\d{1,4}/);return m?m[0]:''}
function cleanText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&#x27;/gi,"'").replace(/&euro;/gi,'€').replace(/\s+/g,' ').trim()}
async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','accept':'text/html,application/xhtml+xml'}});if(!r.ok)throw new Error('HTTP '+r.status);return await r.text()}
function extractLinks(html,setSlug,number,setCode){
  const out=[];const re=/<a[^>]+href=["']([^"']*\/game\/pokemon-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))){let href=m[1].replace(/&amp;/g,'&');if(!/^https?:/i.test(href))href='https://www.pricecharting.com'+(href.startsWith('/')?href:'/'+href);let dec;try{dec=decodeURIComponent(href)}catch(e){dec=href}
    const path=dec.toLowerCase();const codeToken=String(setCode||'').trim().toLowerCase()+String(number||'').trim();const hasCodeNumber=!!setCode&&path.includes(codeToken);const score=(path.includes('/game/pokemon-'+setSlug+'/')?100:0)+(new RegExp('[-/#]'+number+'(?:[/?#]|$)').test(path)?60:0)+(hasCodeNumber?160:0);if(score>0)out.push({href,score,text:cleanText(m[2])});}
  return out.sort((a,b)=>b.score-a.score);
}
function candidateQueries(name,set,number,setCode){
  const n=numOnly(number),raw=String(number||'').trim().toUpperCase(),code=String(setCode||'').trim().toUpperCase(),vals=[];
  const add=v=>{v=String(v||'').trim();if(v&&!vals.includes(v))vals.push(v)};
  const cleanName=String(name||'').trim();
  // PriceCharting no siempre indexa las promos por el código SVP/SM. Para promos
  // probamos explícitamente el formato que usa la ficha: Nombre #n / Nombre n.
  if(code==='SVP'){
    add(cleanName+' #'+n); add(cleanName+' '+n); add(cleanName+' SVP '+String(n).padStart(3,'0'));
    add(cleanName+' SVP'+String(n).padStart(3,'0')); add('SVP '+String(n).padStart(3,'0')); add('SVP'+String(n).padStart(3,'0'));
  }else if(code==='SM'){
    add(cleanName+' #SM'+n); add(cleanName+' SM'+n); add('SM'+n); add('SM '+n+' Pokemon Promo');
  }else if(code){
    add(code+n); add(code+' '+n);
  }
  if(cleanName)add(cleanName+' '+n+' '+set);
  add((set||'')+' '+n); add(cleanName+' '+n); add(n+' '+(set||''));
  return vals;
}
function escRe(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function guidePrice(guideHtml,label){
  const labels=[String(label||'').trim()];
  if(/^PSA 10$/i.test(label))labels.push('PSA10');
  for(const wanted of labels){
    const e=escRe(wanted);
    const rowRe=new RegExp('<tr[^>]*>[\\s\\S]*?\\b'+e+'\\b[\\s\\S]*?\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)[\\s\\S]*?<\\/tr>','i');
    const rm=String(guideHtml||'').match(rowRe);
    if(rm)return Number(rm[1].replace(/,/g,''));
    const clean=cleanText(guideHtml);
    const directRe=new RegExp('\\b'+e+'\\b\\s*(?:[:|]|-)?\\s*\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)','i');
    const dm=clean.match(directRe);
    if(dm)return Number(dm[1].replace(/,/g,''));
  }
  return null;
}
function parseGuide(html,grader,grade){
  const raw=String(html||'');const start=raw.search(/Full Price Guide|Gu[ií]a de Precios Completa/i);let guide=start>=0?raw.slice(start):raw;const end=guide.search(/All prices are the current market price|Los precios de .* se actualizan/i);if(end>0)guide=guide.slice(0,end);
  const g=String(grader||'').toUpperCase();const gradeRaw=String(grade||'').replace(',','.').trim();let wanted='';
  if(g.includes('BGS')||g.includes('BECKETT'))wanted='BGS '+gradeRaw;else if(g.includes('CGC'))wanted='CGC '+gradeRaw;else if(g.includes('PSA'))wanted='PSA '+gradeRaw;else if(g.includes('SGC'))wanted='SGC '+gradeRaw;else if(g.includes('TAG'))wanted='TAG '+gradeRaw;else if(g.includes('ACE'))wanted='ACE '+gradeRaw;else wanted='Grade '+gradeRaw;
  let usd=guidePrice(guide,wanted);
  // Algunas fichas de PriceCharting (por ejemplo ciertas promos) no publican
  // la etiqueta PSA/CGC para un grado, pero sí la categoría genérica "Grade X".
  // Solo usamos ese valor como respaldo si la etiqueta específica no existe.
  if(usd==null && /^(PSA|CGC|SGC|TAG|ACE)\s+\d+(?:\.5)?$/i.test(wanted)){
    const generic='Grade '+gradeRaw;
    const fallback=guidePrice(guide,generic);
    if(fallback!=null)return {usd:fallback,referenceLabel:generic};
  }
  if(usd==null&&/^BGS 8\.5$/i.test(wanted)){const a=guidePrice(guide,'Grade 8'),b=guidePrice(guide,'Grade 9');if(a!=null&&b!=null)return {usdRange:[a,b],referenceLabel:'Grade 8 – Grade 9'}}
  return usd==null?null:{usd,referenceLabel:wanted};
}
async function getUsdEur(){try{const r=await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');if(r.ok){const j=await r.json();const v=Number(j?.rates?.EUR);if(v>0)return v}}catch(e){}return 0.85}
function normalizeSearchName(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function pageMatchesCard(txt,name,number,setCode){
  const clean=String(txt||'');
  const n=numOnly(number),code=String(setCode||'').trim().toUpperCase();
  if(!n)return false;
  const hasNumber = code==='SM' ? (new RegExp('(?:#SM|\\bSM)'+n+'\\b','i').test(clean)) : code==='SVP' ? (new RegExp('(?:#|\\bSVP\\s*)0*'+n+'\\b','i').test(clean)) : (new RegExp('(?:#|\\b)0*'+n+'\\b','i').test(clean));
  if(!hasNumber)return false;
  const wanted=normalizeSearchName(name);
  if(!wanted)return true;
  const pageName=normalizeSearchName(clean);
  const words=wanted.split(' ').filter(x=>x.length>2);
  return words.length===0 || words.every(w=>pageName.includes(w));
}
async function findCard(name,set,number,setCode){
  const code=String(setCode||'').trim().toUpperCase(),n=numOnly(number);if(!n)throw new Error('Falta el número de carta.');
  const slug=(code==='SM'||code==='SVP')?'promo':setSlug(set),direct=[];
  const aliases={
    'DRI|231':'team-rocket%27s-mewtwo-ex-231',
    'PFL|125':'mega-charizard-x-ex-125',
    'SM|210':'moltres-%26-zapdos-%26-articuno-gx-sm210',
    'SVP|051':'snorlax-51'
  };
  const key=code+'|'+n;
  if(aliases[key])direct.push('https://www.pricecharting.com/game/pokemon-'+slug+'/'+aliases[key]);
  // Para cualquier SVP intentamos primero la convención real de PriceCharting: nombre-número.
  if(code==='SVP' && name){
    const nameSlug=slugify(name);
    if(nameSlug)direct.push('https://www.pricecharting.com/game/pokemon-promo/'+nameSlug+'-'+n);
  }
  for(const u of [...new Set(direct)]){try{const html=await fetchText(u);if(/Full Price Guide|Gu[ií]a de Precios Completa/i.test(html) && pageMatchesCard(cleanText(html),name,number,code))return {url:u,html}}catch(e){}}
  for(const q of candidateQueries(name,set,n,code)){
    try{
      const h=await fetchText('https://www.pricecharting.com/search-products?q='+encodeURIComponent(q)+'&type=prices');
      const links=extractLinks(h,slug,n,code);
      // Para SVP, dar prioridad a enlaces cuyo texto de resultado contiene nombre y #n.
      links.sort((a,b)=>{
        const score=u=>{const t=normalizeSearchName(u.text),w=normalizeSearchName(name),nn=String(n);return (w&&t.includes(w)?300:0)+(t.includes('#'+nn)?220:0)+(t.includes(nn)?80:0)+u.score};
        return score(b)-score(a);
      });
      for(const c of links.slice(0,15)){
        try{const page=await fetchText(c.href);if(!/Full Price Guide|Gu[ií]a de Precios Completa/i.test(page))continue;
          if(!pageMatchesCard(cleanText(page),name,number,code))continue;
          return {url:c.href,html:page};
        }catch(e){}
      }
    }catch(e){}
  }
  throw new Error('No se encontró la carta exacta en PriceCharting.');
}
export default async function handler(req,res){try{
  const body=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}):req.query||{};const name=String(body.name||'').trim(),set=String(body.set||'').trim(),number=String(body.number||'').trim(),setCode=String(body.setCode||'').trim().toUpperCase();
  if(!number)return res.status(400).json({ok:false,error:'Falta el número de carta.'});
  const found=await findCard(name,set,number,setCode);const parsed=parseGuide(found.html,body.grader,body.grade);if(!parsed)return res.status(200).json({ok:true,url:found.url,priceDisplay:'Sin datos',referenceLabel:'Sin precio para esa graduación'});
  const rate=await getUsdEur();const fmt=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n*rate);
  if(parsed.usdRange){const a=parsed.usdRange[0],b=parsed.usdRange[1],lo=Math.min(a,b),hi=Math.max(a,b);return res.status(200).json({ok:true,url:found.url,priceUSD:[lo,hi],priceEUR:[lo*rate,hi*rate],priceDisplay:fmt(lo)+' – '+fmt(hi),referenceLabel:parsed.referenceLabel})}
  return res.status(200).json({ok:true,url:found.url,priceUSD:parsed.usd,priceEUR:parsed.usd*rate,priceDisplay:fmt(parsed.usd),referenceLabel:parsed.referenceLabel});
}catch(e){return res.status(502).json({ok:false,error:e?.message||'Error consultando PriceCharting'})}}
