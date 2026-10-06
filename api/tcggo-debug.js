// TCGGO diagnostic + dynamic price resolver for PokeScan.
// IMPORTANT: no internal expansion/slugs database is used.
// TCGdex/PokeScan supplies the set name + code + card number; TCGGO is then
// searched dynamically for the matching card. The analyzer remains visible.

const LANG_LABELS={es:'Spanish',en:'English',fr:'French',de:'German',it:'Italian',ja:'Japanese',ko:'Korean',pt:'Portuguese',zh:'Chinese'};
const API_LANG_SUFFIX={es:'ES',en:'',fr:'FR',de:'DE',it:'IT'};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const slugify=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[\u2018\u2019']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function htmlText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&euro;/gi,'€').replace(/&#8364;/gi,'€').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ')}
function numberValue(v){if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null;}
function parseMoney(raw){const m=String(raw||'').replace(/\u00a0/g,' ').match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/);if(!m)return null;const n=Number(m[1].replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:null;}
function cleanTableCell(v){return String(v||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[[^\]]*\]\([^)]*\)/g,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').replace(/^\s*\|\s*|\s*\|\s*$/g,'').trim();}
function pricesNear(text,label){const out=[];const re=new RegExp('\\b'+label.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'\\b','ig');let m;while((m=re.exec(text))&&out.length<8){const w=text.slice(Math.max(0,m.index-60),m.index+260);const amounts=[...w.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g)].map(x=>x[0]);out.push({position:m.index,window:w.slice(0,320),amounts});}return out;}
function detectPrice(source,label){
  const candidates=[],raw=String(source||''),text=htmlText(raw),wanted=String(label||'').toLowerCase();
  const lines=raw.replace(/\r/g,'').split('\n').map(cleanTableCell).filter(Boolean);
  for(const line of lines){
    const cells=line.split('|').map(cleanTableCell).filter(Boolean);
    if(cells.length>=3&&cells[0].toLowerCase()===wanted&&cells[1].toLowerCase()==='europe'){const price=parseMoney(cells[2]);if(price!==null)candidates.push({pattern:'EU table row',price,language:cells[0],region:cells[1],rawRow:cells.slice(0,3)});}
    const m=line.match(new RegExp('^'+wanted.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'\\s+(Europe)\\s+(.+)$','i'));if(m){const price=parseMoney(m[2]);if(price!==null)candidates.push({pattern:'EU table row (whitespace)',price,language:label,region:m[1],rawRow:[label,m[1],m[2]]});}
  }
  for(const row of raw.match(/<tr[\s\S]*?<\/tr>/gi)||[]){const cells=[...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>cleanTableCell(htmlText(m[1]))).filter(Boolean);if(cells.length>=3&&cells[0].toLowerCase()===wanted&&cells[1].toLowerCase()==='europe'){const price=parseMoney(cells[2]);if(price!==null)candidates.push({pattern:'HTML EU table row',price,language:cells[0],region:cells[1],rawRow:cells.slice(0,3)});}}
  if(!candidates.length){const escaped=String(label||'').replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&');for(const p of [{name:'language|Europe|price',re:new RegExp('\\b'+escaped+'\\b\\s*(?:\\|\\s*)?Europe\\s*(?:\\|\\s*)?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')},{name:'language whitespace Europe price',re:new RegExp('\\b'+escaped+'\\b\\s+Europe\\s+(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')}]){const m=text.match(p.re);if(m){const n=parseMoney(m[1]+' €');if(n!==null)candidates.push({pattern:p.name,price:n,match:m[0]});}}}
  return candidates;
}
function escapeRegExp(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function exactMarkerInText(text,code,number){return new RegExp('\\b'+escapeRegExp(code)+'\\s*'+escapeRegExp(number)+'\\b','i').test(text);}

// Dynamically locate the TCGGO card page from the expansion name + code + number.
// There is deliberately no hard-coded SET_SLUGS table. TCGGO's own expansion page
// is searched and the exact DRI/PFL/etc card link is selected from its links.
async function discoverCardPage({setName,code,number,steps,add}){
  const candidates=[];
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
      const r=await fetch('https://r.jina.ai/'+listUrl,{headers:{accept:'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});
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
      add('7. Carta encontrada','ERROR',`El listado ${setName} existe pero no se encontró ${wanted}.`,{slug,linksSample:uniqueLinks.slice(0,20)});
    }catch(e){add('5. Listado TCGGO','ERROR',e?.message||String(e),{listUrl});}
  }
  return null;
}

async function fetchCardViaProxy(url,code,number,{steps,add}){
  const proxy='https://r.jina.ai/'+url;
  add('8. Página TCGGO','INFO','Leyendo la ficha encontrada mediante proxy.',{proxy});
  try{const r=await fetch(proxy,{headers:{accept:'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});const body=await r.text();add('9. Página HTTP','OK',`Proxy HTTP ${r.status}; ${body.length} caracteres`,{status:r.status,bytes:body.length,preview:body.slice(0,800)});if(!r.ok)return null;const text=htmlText(body);const identity=exactMarkerInText(text,code,number);add('10. Identidad','OK',identity?`TCGGO confirma ${code} ${number}`:`No aparece ${code} ${number} en la ficha`,{identity});if(!identity)return null;return {body,text};}catch(e){add('9. Página HTTP','ERROR',e?.message||String(e));return null;}
}
function cardmarketPriceFromApi(card,languageKey){const cm=card?.prices?.cardmarket||{},suffix=API_LANG_SUFFIX[languageKey],keys=suffix?[`lowest_near_mint_${suffix}_EU_only`,`lowest_near_mint_${suffix}`]:['lowest_near_mint_EU_only','lowest_near_mint'];for(const key of keys){const n=numberValue(cm[key]);if(n!==null)return {price:n,key};}return null;}
async function tryOfficialApi({code,number,nameEnglish,languageKey,steps,add}){
  const key=clean(process.env.TCGGO_API_KEY);if(!key){add('12. TCGGO API','INFO','No se ha configurado TCGGO_API_KEY; no se usa una base externa.',{configured:false});return null;}
  const params=new URLSearchParams({name:nameEnglish||'',card_number:number,per_page:'20',sort:'relevance'}),url=`https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards/search?${params}`;
  add('12. TCGGO API','INFO','Probando API configurada en Vercel.',{url});
  try{const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'cardmarket-api-tcg.p.rapidapi.com','accept':'application/json'},cache:'no-store'});const body=await r.text();add('13. API HTTP',r.ok?'OK':'ERROR',`API respondió HTTP ${r.status}`,{status:r.status,bytes:body.length,preview:body.slice(0,700)});if(!r.ok)return null;let data;try{data=JSON.parse(body)}catch(e){return null;}const arr=Array.isArray(data?.data)?data.data:(Array.isArray(data)?data:[]);const card=arr.find(c=>String(c?.card_code_number||'').toUpperCase()===`${code} ${number}`)||arr.find(c=>String(c?.card_number||'')===String(number)&&String(c?.episode?.code||'').toUpperCase()===code)||arr.find(c=>String(c?.card_number||'')===String(number));add('14. API Carta',card?'OK':'ERROR',card?`Encontrada ${card.name||''}`:'No hay coincidencia exacta.',{card:card?{id:card.id,name:card.name,card_code_number:card.card_code_number}:null});if(!card)return null;const p=cardmarketPriceFromApi(card,languageKey);add('15. API Precio',p?'OK':'ERROR',p?`Precio ${LANG_LABELS[languageKey]}: ${p.price.toFixed(2)} €`:'Sin precio para idioma/región.',{price:p?.price??null,key:p?.key??null});if(!p)return null;return {price:p.price,url:card.tcggo_url||'',source:'TCGGO API'};}catch(e){add('13. API HTTP','ERROR',e?.message||String(e));return null;}
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
  const discovered=await discoverCardPage({setName,code,number,steps,add});
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
  // Optional API is only a secondary method if explicitly configured; it is not a database.
  const apiResult=await tryOfficialApi({code,number,nameEnglish,languageKey,steps,add});
  if(apiResult){add('10. Resultado','OK',`Precio mediante API: ${apiResult.price.toFixed(2)} €`,{price:apiResult.price,source:apiResult.source,url:apiResult.url});return res.status(200).json({ok:true,card:{code,number,nameEnglish,name,setName,language:languageKey},steps});}
  add('10. Resultado','ERROR','No se pudo obtener el precio TCGGO. El analizador muestra el punto exacto.',{price:null});
  return res.status(200).json({ok:false,card:{code,number,nameEnglish,name,setName,language:languageKey},steps});
}
