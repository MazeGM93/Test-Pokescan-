const SET_SLUGS = {
  PFL:'phantasmal-flames', MEP:'mega-evolution', ASC:'ascended-heroes', CRI:'chaos-rising',
  WHF:'white-flare', BLK:'black-bolt', PRE:'prismatic-evolutions', SSP:'surging-sparks',
  SCR:'stellar-crown', SFA:'shrouded-fable', TWM:'twilight-masquerade', TEF:'temporal-forces',
  PAF:'paldean-fates', PAR:'paradox-rift', OBF:'obsidian-flames', PAL:'paldea-evolved',
  SVI:'scarlet-violet', '151':'151', MEG:'mega-evolution'
};
const LANG_LABELS={es:'Spanish',en:'English',fr:'French',de:'German',it:'Italian',ja:'Japanese',ko:'Korean',pt:'Portuguese',zh:'Chinese'};
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const slugify=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
function htmlText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&euro;/gi,'€').replace(/&#8364;/gi,'€').replace(/\s+/g,' ')}
function pricesNear(text,label){const out=[];const re=new RegExp('\\b'+label.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'\\b','ig');let m;while((m=re.exec(text))&&out.length<8){const w=text.slice(Math.max(0,m.index-60),m.index+260);const amounts=[...w.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g)].map(x=>x[0]);out.push({position:m.index,window:w.slice(0,320),amounts});}return out}
function detectPrice(text,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const candidates=[];
  const patterns=[
    {name:'language|region|price',re:new RegExp('\\b'+escaped+'\\b\\s*(?:\\|\\s*)?Europe\\s*(?:\\|\\s*)?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')},
    {name:'language whitespace Europe price',re:new RegExp('\\b'+escaped+'\\b\\s+Europe\\s+(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')},
    {name:'language row first euro',re:new RegExp('\\b'+escaped+'\\b[\\s\\S]{0,220}?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€','i')}
  ];
  for(const p of patterns){const m=text.match(p.re);if(m){const n=Number(m[1].replace(/\./g,'').replace(',','.'));if(Number.isFinite(n))candidates.push({pattern:p.name,price:n,match:m[0]})}}
  return candidates;
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
  let r,html='';
  try{r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PokeScan-Diagnostic/1.0)','accept':'text/html,application/xhtml+xml','accept-language':'es-ES,es;q=0.9,en;q=0.8'},cache:'no-store'});html=await r.text();}
  catch(e){add('5. HTTP','ERROR',e?.message||String(e));return res.status(200).json({ok:false,steps})}
  add('5. HTTP',r.ok?'OK':'ERROR',`HTTP ${r.status}`,{status:r.status,statusText:r.statusText,contentType:r.headers.get('content-type'),bytes:html.length,finalUrl:r.url});
  const text=htmlText(html);
  add('6. HTML','OK',`HTML recibido: ${html.length} caracteres; texto visible: ${text.length}`,{title:(text.match(/.{0,40}Phantasmal.{0,80}/i)||[])[0]||null});
  const identity=new RegExp(`\\b${code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s*${cleanNumber.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`,'i').test(text);
  add('7. Identidad','OK',identity?`TCGGO contiene ${code} ${cleanNumber}`:`NO aparece ${code} ${cleanNumber} en el texto recibido`,{identity});
  const label=LANG_LABELS[languageKey]||'';
  const near=label?pricesNear(text,label):[];
  add('8. Idioma','OK',label?`Buscando ${label}`:'Idioma no soportado',{label,occurrences:near.map(x=>({position:x.position,amounts:x.amounts,window:x.window}))});
  const candidates=label?detectPrice(text,label):[];
  add('9. Precio','OK',candidates.length?`Encontrados ${candidates.length} candidatos`:'NO se encontró ningún precio con los patrones actuales',{candidates});
  const eu=candidates.find(x=>x.pattern==='language|region|price')||candidates.find(x=>x.pattern==='language whitespace Europe price');
  add('10. Resultado',eu?'OK':'ERROR',eu?`Precio detectado: ${eu.price.toFixed(2)} €`:'PokeScan terminaría mostrando «No disponible»',{price:eu?.price??null});
  // Pequeña muestra para diagnóstico, nunca el HTML completo.
  const hits=[]; for(const term of [code,cleanNumber,label,'Europe','€']){const i=text.toLowerCase().indexOf(term.toLowerCase());if(i>=0)hits.push({term,excerpt:text.slice(Math.max(0,i-180),i+420)})}
  add('11. Muestra','INFO','Fragmentos alrededor de términos clave',{hits});
  return res.status(200).json({ok:Boolean(eu),card:{code,number,nameEnglish,name,language:languageKey},steps});
}
