// TCGGO diagnostic + price resolver for PokeScan.
// Strategy:
// 1) Build the exact TCGGO card URL.
// 2) Try the page directly (the current Vercel problem is HTTP 403).
// 3) If direct access is blocked, try the official TCGGO API when TCGGO_API_KEY is configured.
// 4) If no API key is configured, try a read-only text proxy as a diagnostic fallback.
// The analyzer stays enabled so every step is visible in PokeScan.

const SET_SLUGS = {
  PFL:'phantasmal-flames', MEP:'mega-evolution', ASC:'ascended-heroes', CRI:'chaos-rising',
  WHF:'white-flare', BLK:'black-bolt', PRE:'prismatic-evolutions', SSP:'surging-sparks',
  SCR:'stellar-crown', SFA:'shrouded-fable', TWM:'twilight-masquerade', TEF:'temporal-forces',
  PAF:'paldean-fates', PAR:'paradox-rift', OBF:'obsidian-flames', PAL:'paldea-evolved',
  SVI:'scarlet-violet', '151':'151', MEG:'mega-evolution'
};
const LANG_LABELS={es:'Spanish',en:'English',fr:'French',de:'German',it:'Italian',ja:'Japanese',ko:'Korean',pt:'Portuguese',zh:'Chinese'};
const API_LANG_SUFFIX={es:'ES',en:'',fr:'FR',de:'DE',it:'IT'};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const slugify=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function htmlText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&euro;/gi,'€').replace(/&#8364;/gi,'€').replace(/\s+/g,' ')}
function numberValue(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(String(v).replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function pricesNear(text,label){const out=[];const re=new RegExp('\\b'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','ig');let m;while((m=re.exec(text))&&out.length<8){const w=text.slice(Math.max(0,m.index-60),m.index+260);const amounts=[...w.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g)].map(x=>x[0]);out.push({position:m.index,window:w.slice(0,320),amounts});}return out}
function detectPrice(text,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const candidates=[];
  const patterns=[
    {name:'language|Europe|price',re:new RegExp('\\b'+escaped+'\\b\\s*(?:\\|\\s*)?Europe\\s*(?:\\|\\s*)?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')},
    {name:'language whitespace Europe price',re:new RegExp('\\b'+escaped+'\\b\\s+Europe\\s+(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')},
    {name:'language row first euro',re:new RegExp('\\b'+escaped+'\\b[\\s\\S]{0,220}?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')}
  ];
  for(const p of patterns){const m=text.match(p.re);if(m){const n=Number(m[1].replace(/\./g,'').replace(',','.'));if(Number.isFinite(n))candidates.push({pattern:p.name,price:n,match:m[0]})}}
  return candidates;
}
function cardmarketPriceFromApi(card, languageKey){
  const cm=card?.prices?.cardmarket||{};
  const suffix=API_LANG_SUFFIX[languageKey];
  const keys=suffix
    ? [`lowest_near_mint_${suffix}_EU_only`,`lowest_near_mint_${suffix}`]
    : ['lowest_near_mint_EU_only','lowest_near_mint'];
  for(const key of keys){const n=numberValue(cm[key]);if(n!==null)return {price:n,key};}
  return null;
}
function exactApiCard(data,code,number){
  const want=`${code} ${number}`.toUpperCase();
  const arr=Array.isArray(data?.data)?data.data:(Array.isArray(data)?data:[]);
  return arr.find(c=>clean(c?.card_code_number).toUpperCase()===want)
      || arr.find(c=>String(c?.card_number??'')===String(number) && String(c?.episode?.code??'').toUpperCase()===code)
      || arr.find(c=>String(c?.card_number??'')===String(number));
}
async function tryOfficialApi({code,number,nameEnglish,languageKey,steps,add}){
  const key=clean(process.env.TCGGO_API_KEY);
  if(!key){
    add('12. TCGGO API','INFO','No se ha configurado TCGGO_API_KEY en Vercel. Se salta la API oficial.',{configured:false});
    return null;
  }
  const params=new URLSearchParams({name:nameEnglish||'',card_number:number,per_page:'20',sort:'relevance'});
  const url=`https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards/search?${params}`;
  add('12. TCGGO API','INFO','Probando API oficial de TCGGO/RapidAPI.',{url,configured:true});
  try{
    const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'cardmarket-api-tcg.p.rapidapi.com','accept':'application/json'},cache:'no-store'});
    const body=await r.text();
    add('13. API HTTP',r.ok?'OK':'ERROR',`API respondió HTTP ${r.status}`,{status:r.status,bytes:body.length,preview:body.slice(0,700)});
    if(!r.ok)return null;
    let data;try{data=JSON.parse(body)}catch(e){add('14. API JSON','ERROR','La respuesta no es JSON válido');return null;}
    const card=exactApiCard(data,code,number);
    add('14. API Carta',card?'OK':'ERROR',card?`Encontrada ${card.name||''} · ${card.card_code_number||''}`:'La API respondió pero no hay coincidencia exacta.',{card:card?{id:card.id,name:card.name,card_code_number:card.card_code_number,tcgid:card.tcgid,episode:card.episode?.name}:null,results:Array.isArray(data?.data)?data.data.length:0});
    if(!card)return null;
    const p=cardmarketPriceFromApi(card,languageKey);
    add('15. API Precio',p?'OK':'ERROR',p?`Precio ${LANG_LABELS[languageKey]}: ${p.price.toFixed(2)} €`:'La carta existe pero no trae precio Cardmarket para ese idioma/región.',{price:p?.price??null,key:p?.key??null,cardmarket:card.prices?.cardmarket||null});
    if(!p)return null;
    return {price:p.price,url:card.tcggo_url||`https://www.tcggo.com/pokemon/${SET_SLUGS[code]}/${slugify(card.name)}-${encodeURIComponent(number)}`,source:'TCGGO API'};
  }catch(e){add('13. API HTTP','ERROR',e?.message||String(e));return null;}
}
async function tryProxy(url,{code,number,languageKey,steps,add}){
  const proxyUrl='https://r.jina.ai/'+url;
  add('16. Proxy TCGGO','INFO','El acceso directo está bloqueado; probando una lectura de texto de la misma URL de TCGGO.',{proxyUrl});
  try{
    const r=await fetch(proxyUrl,{headers:{'accept':'text/plain','user-agent':'PokeScan/1.0'},cache:'no-store'});
    const body=await r.text();
    add('17. Proxy HTTP',r.ok?'OK':'ERROR',`Proxy respondió HTTP ${r.status}`,{status:r.status,bytes:body.length,preview:body.slice(0,900)});
    if(!r.ok)return null;
    const text=htmlText(body);
    const identity=new RegExp(`\\b${code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*${number.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'i').test(text);
    add('18. Proxy Identidad',identity?'OK':'INFO',identity?`La respuesta contiene ${code} ${number}`:`No aparece ${code} ${number} literalmente en el texto del proxy.`,{identity});
    const label=LANG_LABELS[languageKey];
    const candidates=detectPrice(text,label);
    add('19. Proxy Precio','OK',candidates.length?`Encontrados ${candidates.length} candidatos`:'No se encontró precio en el proxy',{candidates});
    const eu=candidates[0];
    if(eu)return {price:eu.price,url,source:'TCGGO (proxy de lectura)'};
  }catch(e){add('17. Proxy HTTP','ERROR',e?.message||String(e));}
  return null;
}
export default async function handler(req,res){
  const q=req.method==='POST'?(req.body||{}):(req.query||{});
  const code=clean(q.code||q.setCode).toUpperCase();
  const number=clean(q.number||q.localId).split('/')[0].trim();
  const lang=clean(q.lang||q.language||'es').toLowerCase();
  const nameEnglish=clean(q.nameEnglish||q.cardmarketNameEnglish||'');
  const name=clean(q.name||'');
  const languageKey=({es:'es',español:'es',spanish:'es',en:'en',inglés:'en',english:'en',fr:'fr',francés:'fr',french:'fr',de:'de',alemán:'de',german:'de',it:'it',italiano:'it',italian:'it',ja:'ja',japonés:'ja',japanese:'ja',ko:'ko',coreano:'ko',korean:'ko',pt:'pt',portugués:'pt',portuguese:'pt',zh:'zh',chino:'zh',chinese:'zh'})[lang]||lang;
  const steps=[]; const add=(step,status,detail,data)=>steps.push({step,status,detail,data:data??null});
  add('1. Entrada','OK','Datos recibidos',{code,number,lang:languageKey,nameEnglish,name});
  if(!code||!number){add('2. Validación','ERROR','Falta código o número');return res.status(400).json({ok:false,steps})}
  const setSlug=SET_SLUGS[code];
  add('2. Expansión','OK',setSlug?`Código ${code} → ${setSlug}`:`No existe ruta configurada para ${code}`,{setSlug});
  if(!setSlug)return res.status(404).json({ok:false,steps});
  const slugName=slugify(nameEnglish||name);
  add('3. Nombre TCGGO','OK',slugName?`Nombre usado: ${nameEnglish||name} → ${slugName}`:'No hay nombre para construir la URL',{slugName});
  if(!slugName)return res.status(400).json({ok:false,steps});
  const cleanNumber=number.replace(/^0+(?=\d)/,'');
  const url=`https://www.tcggo.com/pokemon/${setSlug}/${slugName}-${encodeURIComponent(cleanNumber)}`;
  add('4. URL','OK',url,{url});

  // Direct page: expected to expose the original 403 problem, but keep it visible.
  let direct=null,html='';
  try{direct=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PokeScan-Diagnostic/2.0)','accept':'text/html,application/xhtml+xml','accept-language':'es-ES,es;q=0.9,en;q=0.8'},cache:'no-store'});html=await direct.text();}
  catch(e){add('5. HTTP directo','ERROR',e?.message||String(e));}
  if(direct){
    add('5. HTTP directo',direct.ok?'OK':'ERROR',`HTTP ${direct.status}`,{status:direct.status,statusText:direct.statusText,contentType:direct.headers.get('content-type'),bytes:html.length,finalUrl:direct.url});
    const text=htmlText(html);
    add('6. HTML directo','OK',`HTML recibido: ${html.length} caracteres; texto visible: ${text.length}`,{title:(text.match(/.{0,40}Phantasmal.{0,80}/i)||[])[0]||null});
    const identity=new RegExp(`\\b${code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*${cleanNumber.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'i').test(text);
    add('7. Identidad directa','OK',identity?`TCGGO contiene ${code} ${cleanNumber}`:`NO aparece ${code} ${cleanNumber} en el texto recibido`,{identity});
    const label=LANG_LABELS[languageKey]||'';
    const near=label?pricesNear(text,label):[];
    add('8. Idioma directo','OK',label?`Buscando ${label}`:'Idioma no soportado',{label,occurrences:near.map(x=>({position:x.position,amounts:x.amounts,window:x.window}))});
    const candidates=label?detectPrice(text,label):[];
    add('9. Precio directo','OK',candidates.length?`Encontrados ${candidates.length} candidatos`:'NO se encontró ningún precio con los patrones actuales',{candidates});
    const eu=candidates.find(x=>x.pattern==='language|Europe|price')||candidates.find(x=>x.pattern==='language whitespace Europe price');
    if(eu){
      add('10. Resultado','OK',`Precio detectado directamente: ${eu.price.toFixed(2)} €`,{price:eu.price,source:'TCGGO HTML',url});
      return res.status(200).json({ok:true,card:{code,number,nameEnglish,name,language:languageKey},steps});
    }
  }

  const apiResult=await tryOfficialApi({code,number,nameEnglish,languageKey,steps,add});
  if(apiResult){
    add('10. Resultado','OK',`Precio detectado mediante API oficial: ${apiResult.price.toFixed(2)} €`,{price:apiResult.price,source:apiResult.source,url:apiResult.url});
    return res.status(200).json({ok:true,card:{code,number,nameEnglish,name,language:languageKey},steps});
  }

  const proxyResult=await tryProxy(url,{code,number,languageKey,steps,add});
  if(proxyResult){
    add('10. Resultado','OK',`Precio detectado mediante ${proxyResult.source}: ${proxyResult.price.toFixed(2)} €`,{price:proxyResult.price,source:proxyResult.source,url:proxyResult.url});
    return res.status(200).json({ok:true,card:{code,number,nameEnglish,name,language:languageKey},steps});
  }

  add('10. Resultado','ERROR','No se pudo obtener el precio. El analizador deja visible qué método ha fallado.',{price:null});
  const hits=[];
  if(html){const text=htmlText(html);for(const term of [code,cleanNumber,LANG_LABELS[languageKey]||'', 'Europe','€']){const i=text.toLowerCase().indexOf(term.toLowerCase());if(i>=0)hits.push({term,excerpt:text.slice(Math.max(0,i-180),i+420)})}}
  add('11. Muestra','INFO','Fragmentos alrededor de términos clave',{hits});
  return res.status(200).json({ok:false,card:{code,number,nameEnglish,name,language:languageKey},steps});
}
