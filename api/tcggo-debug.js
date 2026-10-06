// TCGGO diagnostic + dynamic price resolver for PokeScan.
// IMPORTANT: no internal expansion/slugs database is used.
// TCGdex/PokeScan supplies the set name + code + card number; TCGGO is then
// searched dynamically for the matching card. The analyzer remains visible.

const LANG_LABELS={es:'Spanish',en:'English',fr:'French',de:'German',it:'Italian',ja:'Japanese',ko:'Korean',pt:'Portuguese',zh:'Chinese'};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const withTimeout=async (url,options={},ms=18000)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal})}finally{clearTimeout(t)}};
const slugify=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[\u2018\u2019']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function htmlText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&euro;/gi,'€').replace(/&#8364;/gi,'€').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ')}
function numberValue(v){if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;}
function parseMoney(raw){
  const text=String(raw||'').replace(/\u00a0/g,' ').trim();
  const m=text.match(/(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)\s*€/);
  if(!m)return null;
  let n=String(m[1]).replace(/\s/g,'');
  if(n.includes(',') && n.includes('.')) n=n.replace(/\./g,'').replace(',','.');
  else if(n.includes(',')) n=n.replace(',','.');
  else {
    const dots=(n.match(/\./g)||[]).length;
    if(dots>1)n=n.replace(/\./g,'');
  }
  const value=Number(n);
  return Number.isFinite(value)?value:null;
}
function cleanTableCell(v){return String(v||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[[^\]]*\]\([^)]*\)/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').replace(/^\s*\|\s*|\s*\|\s*$/g,'').trim()}
function normalizeProxyText(source){
  return String(source||'')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&euro;/gi,'€')
    .replace(/&#8364;/gi,'€')
    .replace(/&#39;|&#x27;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/ *\| */g,' | ')
    .trim();
}
function detectPrice(source,label){
  const candidates=[],raw=String(source||''),wanted=String(label||'').trim();
  if(!wanted)return candidates;
  const normalized=normalizeProxyText(raw);
  const wantedEsc=escapeRegExp(wanted);

  // 1) The most reliable form: a Markdown/HTML table row containing
  // Language | Region | Price. Do NOT depend on the literal "EU Prices"
  // heading because the proxy can omit that heading while preserving rows.
  const rowPatterns=[
    new RegExp('(?:^|\\n|\\|)\\s*'+wantedEsc+'\\s*\\|\\s*(?:Europe|EU)\\s*\\|\\s*([^\\n|]*?\\d{1,3}(?:[.\\s]\\d{3})*(?:[,\\.]\\d{1,2})?\\s*€)', 'ig'),
    new RegExp('(?:^|\\n|\\|)\\s*'+wantedEsc+'\\s+(?:Europe|EU)\\s+(\\d{1,3}(?:[.\\s]\\d{3})*(?:[,\\.]\\d{1,2})?\\s*€)', 'ig')
  ];
  for(const re of rowPatterns){
    let m;
    while((m=re.exec(normalized)) && candidates.length<10){
      const price=parseMoney(m[1]);
      if(price!==null)candidates.push({pattern:'language | Europe | €',price,language:wanted,region:'Europe',rawRow:m[0].trim()});
    }
    if(candidates.length)break;
  }

  // 2) Parse raw HTML table rows if the proxy returned HTML instead of Markdown.
  for(const rowHtml of raw.match(/<tr[\s\S]*?<\/tr>/gi)||[]){
    const cells=[...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>cleanTableCell(m[1])).filter(Boolean);
    if(cells.length>=3 && cells[0].toLowerCase()===wanted.toLowerCase() && /^(Europe|EU)$/i.test(cells[1])){
      const price=parseMoney(cells[2]);
      if(price!==null && !candidates.some(c=>c.price===price))candidates.push({pattern:'HTML language/region/€ row',price,language:wanted,region:'Europe',rawRow:cells.slice(0,3)});
    }
  }
  if(candidates.length)return candidates;

  // 3) Fallback: search a tight window around the requested language and
  // require both Europe/EU and the euro symbol. This is intentionally much
  // stricter than "first number on page" and avoids US/graded prices.
  const proximity=new RegExp(wantedEsc+'[\\s\\S]{0,220}?(?:Europe|EU)[\\s\\S]{0,120}?(\\d{1,3}(?:[.\\s]\\d{3})*(?:[,\\.]\\d{1,2})?)\\s*€','i').exec(normalized);
  if(proximity){
    const price=parseMoney(proximity[1]+' €');
    if(price!==null)candidates.push({pattern:'language → Europe → € proximity',price,language:wanted,region:'Europe',match:proximity[0]});
  }
  if(candidates.length)return candidates;

  // 4) Some renderings put the euro amount immediately after the language
  // and Europe marker in the opposite textual order. Keep this as a final
  // fallback, still requiring all three pieces.
  const reverse=new RegExp('(?:Europe|EU)[\\s\\S]{0,100}?'+wantedEsc+'[\\s\\S]{0,120}?(\\d{1,3}(?:[.\\s]\\d{3})*(?:[,\\.]\\d{1,2})?)\\s*€','i').exec(normalized);
  if(reverse){
    const price=parseMoney(reverse[1]+' €');
    if(price!==null)candidates.push({pattern:'Europe → language → € proximity',price,language:wanted,region:'Europe',match:reverse[0]});
  }
  return candidates;
}

function escapeRegExp(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function exactMarkerInText(text,code,number){return new RegExp('\\b'+escapeRegExp(code)+'\\s*'+escapeRegExp(number)+'\\b','i').test(text);}

// Dynamically locate the TCGGO card page from the expansion name + code + number.
// There is deliberately no hard-coded SET_SLUGS table. TCGGO's own expansion page
// is searched and the exact DRI/PFL/etc card link is selected from its links.
async function discoverCardPage({setName,code,number,nameEnglish,steps,add}){
  const candidates=[];
  // First try the card URL derived from the English name already supplied by TCGdex.
  // This avoids depending on which 20 cards TCGGO exposes on a paginated listing.
  if(nameEnglish){
    const directSlug=slugify(nameEnglish)+'-'+String(number);
    const directUrl=`https://www.tcggo.com/pokemon/${slugify(setName)}/${directSlug}`;
    add('3. TCGGO directo','INFO',`Probando la ficha dinámica a partir del nombre de TCGdex: ${directUrl}`,{directUrl,nameEnglish});
    try{
      const r=await withTimeout('https://r.jina.ai/'+directUrl,{headers:{accept:'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});
      const body=await r.text();
      add('3A. Ficha directa','OK',`Proxy HTTP ${r.status}; ${body.length} caracteres`,{status:r.status,bytes:body.length,preview:body.slice(0,500)});
      if(r.ok){
        const text=htmlText(body);
        const okName=new RegExp(escapeRegExp(String(nameEnglish).trim()).replace(/\s+/g,'\\s+'),'i').test(text);
        const okNum=new RegExp('(?:Card number|'+escapeRegExp(String(code))+')\\s*'+escapeRegExp(String(number)),'i').test(text) || new RegExp('\\b'+escapeRegExp(String(number))+'\\b').test(text);
        if(okName && okNum){add('3B. Carta directa','OK',`${code} ${number} → ${directUrl}`,{url:directUrl});return {url:directUrl,slug:slugify(setName),method:'name-direct'};}
        add('3B. Carta directa','INFO','La ficha derivada no se pudo validar; se continúa con el listado TCGGO.',{okName,okNum});
      }
    }catch(e){add('3A. Ficha directa','INFO',`No respondió a tiempo o falló: ${e?.message||String(e)}; se continúa con el listado.`);} 
  }
  const derived=slugify(setName);
  if(derived)candidates.push(derived);
  // Small normalization only; this is not an expansion database.
  if(derived && derived.startsWith('pokemon-'))candidates.push(derived.slice(8));
  const unique=[...new Set(candidates.filter(Boolean))];
  add('3. TCGGO expansión','INFO',unique.length?`Derivando la ruta desde el nombre recibido: ${setName}`:'No se recibió nombre de expansión.',{setName,candidateSlugs:unique});
  if(!unique.length)return null;
  const wanted=String(code+' '+number).toUpperCase();
  for(const slug of unique){
    const listUrl=`https://www.tcggo.com/pokemon/${slug}/singles/card_number_highest`;
    add('4. Búsqueda TCGGO','INFO',`Consultando el listado de ${setName}: ${listUrl}`,{listUrl,slug});
    try{
      const r=await withTimeout('https://r.jina.ai/'+listUrl,{headers:{accept:'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});
      const body=await r.text();
      add('5. Listado TCGGO','OK',`Proxy HTTP ${r.status}; ${body.length} caracteres`,{status:r.status,bytes:body.length,preview:body.slice(0,700)});
      if(!r.ok)continue;
      const text=htmlText(body);
      if(!new RegExp('\\b'+escapeRegExp(String(code))+'\\b','i').test(text)){add('6. Código en listado','INFO',`No aparece ${code} en este listado.`,{slug});continue;}
      // Jina/Markdown usually exposes links as [Title](URL). Also accept raw hrefs.
      const links=[];
      for(const m of body.matchAll(/\[[^\]]*\]\((https?:\/\/www\.tcggo\.com\/pokemon\/[^)]+)\)/gi))links.push(m[1]);
      for(const m of body.matchAll(/https?:\/\/www\.tcggo\.com\/pokemon\/[^\s)<>]+/gi))links.push(m[0]);
      const uniqueLinks=[...new Set(links.map(u=>u.replace(/[),.;]+$/,'')))];
      let found=null;
      for(const u of uniqueLinks){
        const low=decodeURIComponent(u).toLowerCase();
        const path=low.split('?')[0];
        const tail=path.split('/').pop()||'';
        if(!tail.endsWith('-'+String(number).toLowerCase()))continue;
        // Verify the code+number is present in the link's surrounding text or URL.
        const idx=body.toLowerCase().indexOf(u.toLowerCase());
        const context=idx>=0?body.slice(Math.max(0,idx-500),idx+500):'';
        if(new RegExp('\\b'+escapeRegExp(String(code))+'\\s*'+escapeRegExp(String(number))+'\\b','i').test(context)||tail.includes(String(number).toLowerCase())){found=u;break;}
      }
      if(found){add('7. Carta encontrada','OK',`${wanted} → ${found}`,{url:found});return {url:found,slug};}
      // Fallback: locate exact code/number in text and extract a nearby TCGGO URL.
      const marker=new RegExp('\\b'+escapeRegExp(String(code))+'\\s*'+escapeRegExp(String(number))+'\\b','ig');
      const mm=marker.exec(body);if(mm){const near=body.slice(Math.max(0,mm.index-1000),mm.index+1000).match(/https?:\/\/www\.tcggo\.com\/pokemon\/[^\s)<>]+/i);if(near){add('7. Carta encontrada','OK',`${wanted} → ${near[0]}`,{url:near[0]});return {url:near[0],slug};}}
      if(nameEnglish){
        const nre=new RegExp(escapeRegExp(String(nameEnglish).trim()).replace(/\s+/g,'\\s+'),'i');
        const nm=nre.exec(body);
        if(nm){const near=body.slice(Math.max(0,nm.index-1200),nm.index+1200).match(/https?:\/\/www\.tcggo\.com\/pokemon\/[^\s)<>]+/i);if(near){add('7. Carta encontrada','OK',`${nameEnglish} (${wanted}) → ${near[0]}`,{url:near[0],method:'name-nearby'});return {url:near[0],slug};}}
      }
      add('7. Carta encontrada','ERROR',`El listado ${setName} existe pero no se encontró ${wanted}.`,{slug,linksSample:uniqueLinks.slice(0,20)});
    }catch(e){add('5. Listado TCGGO','ERROR',e?.message||String(e),{listUrl});}
  }
  return null;
}

async function fetchCardViaProxy(url,code,number,{steps,add}){
  const proxy='https://r.jina.ai/'+url;
  add('8. Página TCGGO','INFO','Leyendo la ficha encontrada mediante proxy.',{proxy});
  try{const r=await withTimeout(proxy,{headers:{accept:'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});const body=await r.text();add('9. Página HTTP','OK',`Proxy HTTP ${r.status}; ${body.length} caracteres`,{status:r.status,bytes:body.length,preview:body.slice(0,800)});if(!r.ok)return null;const text=htmlText(body);const identity=exactMarkerInText(text,code,number);add('10. Identidad','OK',identity?`TCGGO confirma ${code} ${number}`:`No aparece ${code} ${number} en la ficha`,{identity});if(!identity)return null;return {body,text};}catch(e){add('9. Página HTTP','ERROR',e?.message||String(e));return null;}
}

export default async function handler(req,res){
  const q=req.method==='POST'?(req.body||{}):(req.query||{});
  const code=clean(q.code||q.setCode).toUpperCase(),number=clean(q.number||q.localId).split('/')[0].trim(),lang=clean(q.lang||q.language||'es').toLowerCase();
  const nameEnglish=clean(q.nameEnglish||q.cardmarketNameEnglish||''),name=clean(q.name||''),setName=clean(q.setName||q.expansion||q.set||'');
  const languageKey=({es:'es',español:'es',spanish:'es',en:'en',inglés:'en',english:'en',fr:'fr',francés:'fr',french:'fr',de:'de',alemán:'de',german:'de',it:'it',italiano:'it',italian:'it',ja:'ja',japonés:'ja',japanese:'ja',ko:'ko',coreano:'ko',korean:'ko',pt:'pt',portugués:'pt',portuguese:'pt',zh:'zh',chino:'zh',chinese:'zh'})[lang]||lang;
  const steps=[],add=(step,status,detail,data)=>steps.push({step,status,detail,data:data??null});
  add('1. Entrada','OK','Código + número + datos de TCGdex recibidos',{code,number,lang:languageKey,nameEnglish,name,setName});
  if(!code||!number){add('2. Validación','ERROR','Falta código o número');return res.status(400).json({ok:false,steps});}
  add('2. Identificador','OK',`Identificador principal: ${code} ${number}`,{code,number});

  // First try the dynamic TCGGO listing derived from TCGdex's set name.
  const discovered=await discoverCardPage({setName,code,number,nameEnglish,steps,add});
  if(!discovered){add('7. Descubrimiento','ERROR',`No se encontró ${code} ${number} en TCGGO usando la expansión ${setName||'(sin nombre)'}.`);return res.status(200).json({ok:false,steps});}
  const cardPage=discovered.url;
  add('8. URL final','OK',cardPage,{url:cardPage});

  const page=await fetchCardViaProxy(cardPage,code,number,{steps,add});
  if(page){
    const candidates=detectPrice(page.body,LANG_LABELS[languageKey]||'');
    add('11. Precio TCGGO','OK',candidates.length?`Encontrados ${candidates.length} candidatos; se exige Language=${LANG_LABELS[languageKey]} y Region=Europe.`:'No se encontró una fila exacta de idioma/región.',{candidates});
    const exact=candidates.find(c=>c.language?.toLowerCase()===String(LANG_LABELS[languageKey]).toLowerCase()&&c.region?.toLowerCase()==='europe');
    if(exact){add('10. Resultado','OK',`Precio TCGGO: ${exact.price.toFixed(2)} €`,{price:exact.price,source:'TCGGO',language:LANG_LABELS[languageKey],region:'Europe',url:cardPage});return res.status(200).json({ok:true,card:{code,number,nameEnglish,name,setName,language:languageKey},steps});}
  }
  add('10. Resultado','ERROR','TCGGO encontró la ficha, pero no se pudo extraer un precio para el idioma/región seleccionados.',{price:null,language:LANG_LABELS[languageKey]||languageKey,region:'Europe'});
  return res.status(200).json({ok:false,card:{code,number,nameEnglish,name,setName,language:languageKey},steps});
}
