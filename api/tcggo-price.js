const LANG_LABELS = {
  Español: 'Spanish',
  Inglés: 'English',
  Francés: 'French',
  Alemán: 'German',
  Italiano: 'Italian',
  Portugués: 'Portuguese',
  Japonés: 'Japanese',
  Coreano: 'Korean',
  Checo: 'Czech',
  Neerlandés: 'Dutch',
  Polaco: 'Polish'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchTimeout(url, options={}, ms=8000){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), ms);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{ clearTimeout(timer); }
}
function cleanText(s){
  return String(s||'')
    .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'")
    .replace(/&quot;|&#x22;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&euro;|&#8364;|&#x20ac;/gi,'€')
    .replace(/\u00a0/g,' ')
    .replace(/<br\s*\/?>(?=.)/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ').trim();
}
function escRe(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function norm(s){
  return cleanText(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
}
function rawNumber(n){
  return String(n||'').split('/')[0].trim().replace(/^0+/,'') || String(n||'').split('/')[0].trim();
}
function identityMatches(text, code, number, name){
  const t=norm(text);
  const c=norm(code);
  const n=rawNumber(number);
  if(!c || !n) return false;
  const codeNum=norm(`${code} ${n}`);
  const compact=t.replace(/\s+/g,'');
  const codeCompact=(c+n).replace(/\s+/g,'');
  const hasCodeNum=t.includes(codeNum) || compact.includes(codeCompact);
  if(!hasCodeNum) return false;
  if(name){
    const nn=norm(name);
    const words=nn.split(' ').filter(w=>w.length>=3).slice(0,4);
    const hits=words.filter(w=>t.includes(w)).length;
    if(words.length && hits<Math.min(2,words.length)) return false;
  }
  return true;
}
function absoluteTcggoUrl(href){
  try{
    const u=new URL(href,'https://www.tcggo.com');
    if(u.hostname!=='www.tcggo.com' && u.hostname!=='tcggo.com') return '';
    if(!/^\/pokemon(?:-jp)?\//i.test(u.pathname)) return '';
    if(/\/singles(?:\/|$)/i.test(u.pathname)) return '';
    return u.toString();
  }catch(e){return '';}
}
function collectCandidates(text, code, number, name){
  const out=[];
  const seen=new Set();
  const add=(url,context)=>{
    const u=absoluteTcggoUrl(url);
    if(!u || seen.has(u)) return;
    const ok=identityMatches(context||text,code,number,'') ||
      identityMatches(u,code,number,'');
    if(ok){seen.add(u);out.push({url:u,context:String(context||'').slice(0,1200)});}
  };
  // Markdown links
  let m;
  const md=/\]\((https?:\/\/(?:www\.)?tcggo\.com\/pokemon\/[^)\s]+)\)/gi;
  while((m=md.exec(text))){
    const start=Math.max(0,m.index-500), end=Math.min(text.length,m.index+m[0].length+500);
    add(m[1],text.slice(start,end));
  }
  // Raw URLs
  const raw=/https?:\/\/(?:www\.)?tcggo\.com\/pokemon\/[^\s)\]"']+/gi;
  while((m=raw.exec(text))) {
    const start=Math.max(0,m.index-500), end=Math.min(text.length,m.index+m[0].length+500);
    add(m[0],text.slice(start,end));
  }
  // HTML hrefs, if proxy returned HTML
  const href=/href=["'](\/pokemon\/[^"']+)["']/gi;
  while((m=href.exec(text))){
    const start=Math.max(0,m.index-700), end=Math.min(text.length,m.index+m[0].length+700);
    add(m[1],text.slice(start,end));
  }
  return out;
}
function parseEuroPrice(s){
  const x=String(s||'').replace(/\u00a0/g,' ').replace(/&euro;|&#8364;|&#x20ac;/gi,'€').replace(/\s+/g,' ').trim();
  const patterns=[
    /€\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)/,
    /(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*€/
  ];
  let m=null;
  for(const re of patterns){m=x.match(re);if(m)break;}
  if(!m)return null;
  let raw=m[1].replace(/\s/g,'');
  if(raw.includes(',') && raw.includes('.')){
    if(raw.lastIndexOf(',')>raw.lastIndexOf('.')) raw=raw.replace(/\./g,'').replace(',','.');
    else raw=raw.replace(/,/g,'');
  }else if(raw.includes(',')){
    raw=raw.replace(',','.');
  }else if((raw.match(/\./g)||[]).length>1){
    raw=raw.replace(/\./g,'');
  }
  const v=Number(raw);
  return Number.isFinite(v)?v:null;
}
function parseLanguagePrice(text, language){
  const wanted=LANG_LABELS[language]||language||'Spanish';
  const source=String(text||'');
  // 1) Preserve line/row boundaries when Jina returns Markdown/HTML-like tables.
  const htmlish=source.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');
  const normalized=htmlish
    .replace(/&euro;|&#8364;|&#x20ac;/gi,'€')
    .replace(/&nbsp;|\u00a0/gi,' ')
    .replace(/<br\s*\/?>(?=.)/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/\r/g,'');
  const wantedRe=escRe(wanted);
  const priceRe='(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*€';
  // Exact table-row style, allowing pipes, tabs or newlines between columns.
  const rowRe=new RegExp(`${wantedRe}[^\n|]{0,80}[|\t\n ]+[^\n|]{0,80}Europe[^\n|]{0,100}${priceRe}|${wantedRe}[^\n|]{0,80}Europe[^\n|]{0,120}${priceRe}`,'i');
  let m=normalized.match(rowRe);
  if(m){
    const p=parseEuroPrice(m[0]);
    if(p!=null)return {price:p,display:(m[0].match(/(?:€\s*)?\d[\d.,\s]*\s*€/i)||[])[0]?.trim()||`${p} €`};
  }
  // 2) Flattened Markdown/text: language -> Europe -> price within a tight window.
  const flat=cleanText(normalized).replace(/[|*`]+/g,' ');
  const lower=flat.toLowerCase();
  let pos=0;
  while((pos=lower.indexOf(String(wanted).toLowerCase(),pos))>=0){
    const win=flat.slice(pos,pos+700);
    const e=win.match(/\bEurope\b/i);
    if(e){
      const after=win.slice(e.index+e[0].length,e.index+e[0].length+180);
      const p=parseEuroPrice(after);
      if(p!=null){
        const dm=after.match(/(?:€\s*)?\d[\d.,\s]*\s*€/i);
        return {price:p,display:dm?dm[0].trim():`${p} €`};
      }
    }
    pos+=String(wanted).length;
  }
  // 3) Reverse layout fallback: Europe -> language -> price in the same short row.
  const revRe=new RegExp(`Europe[^\n|]{0,100}${wantedRe}[^\n|]{0,120}${priceRe}`,'i');
  m=normalized.match(revRe);
  if(m){
    const p=parseEuroPrice(m[0]);
    if(p!=null)return {price:p,display:(m[0].match(/(?:€\s*)?\d[\d.,\s]*\s*€/i)||[])[0]?.trim()||`${p} €`};
  }
  return null;
}
function searchNumberVariants(code, number){
  const raw=String(number||'').split('/')[0].trim();
  const out=[];
  const add=v=>{v=String(v||'').trim(); if(v && !out.includes(v)) out.push(v);};
  add(raw);
  // Only the promo families explicitly known to require a leading zero are
  // normalized. Do NOT pad ordinary Japanese numbers such as SV9A 77 here.
  if(/^MEP$/i.test(code) || /^SVP$/i.test(code)){
    const digits=raw.replace(/^0+/,'');
    if(/^\d{1,2}$/.test(digits)) add(digits.padStart(3,'0'));
  }
  // TCGGO's main search accepts both forms for Japanese collector numbers.
  // Try the zero-padded form as a second query without changing the card's
  // stored number.
  if(/^SV[A-Z0-9]*$/i.test(code)){
    const digits=raw.replace(/^0+/,'');
    if(/^\d{1,2}$/.test(digits)) add(digits.padStart(3,'0'));
  }
  return out;
}

const SET_SLUG_BY_CODE={
  PFL:'phantasmal-flames',
  DRI:'destined-rivals',
  BLK:'black-bolt',
  WHT:'white-flare',
  MEG:'mega-evolution',
  ME01:'mega-evolution',
  ME02:'phantasmal-flames',
  SSP:'surging-sparks',
  SFA:'shrouded-fable',
  TWM:'twilight-masquerade',
  TEF:'temporal-forces',
  PAR:'paradox-rift',
  OBF:'obsidian-flames',
  PAL:'paldea-evolved',
  SVI:'scarlet-violet',
  PAF:'paldean-fates',
  MEW:'pokemon-151',
  CRZ:'crown-zenith',
  SIT:'silver-tempest',
  LOR:'lost-origin',
  ASR:'astral-radiance',
  BRS:'brilliant-stars',
  EVS:'evolving-skies',
  FST:'fusion-strike',
  CRE:'chilling-reign',
  BST:'battle-styles'
};
function directUrlFromKnown(nameEnglish,setName,number,code){
  const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/['’]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!nameEnglish||!number)return '';
  const setSlug=SET_SLUG_BY_CODE[String(code||'').trim().toUpperCase()]||slug(setName);
  if(!setSlug)return '';
  return `https://www.tcggo.com/pokemon/${setSlug}/${slug(nameEnglish)}-${rawNumber(number)}`;
}
async function fetchCardPage(url){
  const proxy='https://r.jina.ai/'+url;
  const r=await fetchTimeout(proxy,{headers:{Accept:'text/plain'}},7000);
  const text=await r.text();
  return {status:r.status,text,url};
}
async function apiLookup({name,number,cardmarketId,code,steps,add}){
  const key=String(process.env.TCGGO_API_KEY||'').trim();
  if(!key)return null;
  const params=new URLSearchParams();
  if(name)params.set('name',name);
  if(number)params.set('card_number',rawNumber(number));
  if(cardmarketId)params.set('cardmarket_id',String(cardmarketId));
  params.set('sort','relevance');
  const url=`https://cardmarket-api-tcg.p.rapidapi.com/pokemon/cards/search?${params.toString()}`;
  add('TCGGO API','Consultando la búsqueda oficial TCGGO (RapidAPI).');
  const r=await fetchTimeout(url,{
    headers:{'x-rapidapi-key':key,'x-rapidapi-host':'cardmarket-api-tcg.p.rapidapi.com',Accept:'application/json'}
  },7000);
  const j=await r.json().catch(()=>null);
  steps.push({title:'API TCGGO',ok:r.ok&&!!j,detail:`HTTP ${r.status}`});
  if(!r.ok || !j)return null;
  const arr=Array.isArray(j?.data)?j.data:Array.isArray(j?.results)?j.results:[];
  const exact=arr.find(c=>{
    const cn=String(c?.card_number||c?.number||'').split('/')[0].trim();
    const n=rawNumber(number);
    const sameNum=cn===n || rawNumber(cn)===n;
    const sameName=!name || norm(String(c?.name||''))===norm(name) || norm(String(c?.name||'')).includes(norm(name));
    const sameCode=!code || norm(String(c?.episode?.code||c?.set?.code||''))===norm(code);
    return sameNum && sameName && sameCode;
  }) || arr.find(c=>rawNumber(c?.card_number)===rawNumber(number));
  if(!exact)return null;
  return {
    id:exact.id||exact.tcggo_id||'',
    url:exact.tcggo_url||exact.url||'',
    name:exact.name||name,
    cardNumber:exact.card_number||number,
    cardmarketId:exact.cardmarket_id||exact.links?.cardmarket_id||cardmarketId||'',
    source:'TCGGO API'
  };
}
async function publicSearch({name,number,code,steps,add}){
  const nums=searchNumberVariants(code,number);
  const queries=[];
  for(const n of nums){
    const q1=`${code||''} ${n}`.trim();
    const q2=`${name||''} ${n}`.trim();
    const q3=`${name||''} ${code||''} ${n}`.replace(/\s+/g,' ').trim();
    // Main TCGGO search first. Try code+number, then name+number and finally
    // the strongest combined identity: name + set code + collector number.
    queries.push(`https://www.tcggo.com/pokemon?search=${encodeURIComponent(q1)}`);
    if(name) queries.push(`https://www.tcggo.com/pokemon?search=${encodeURIComponent(q2)}`);
    if(name && code) queries.push(`https://www.tcggo.com/pokemon?search=${encodeURIComponent(q3)}`);
  }
  // Keep the Japanese main-search surface only as a fallback for cases where
  // the general Pokémon search does not expose the Japanese card link.
  for(const n of nums){
    const q1=`${code||''} ${n}`.trim();
    queries.push(`https://www.tcggo.com/pokemon-jp?search=${encodeURIComponent(q1)}`);
  }

  add('Búsqueda TCGGO',`Buscando en el buscador principal: ${queries.slice(0,3).map(u=>decodeURIComponent(new URL(u).searchParams.get('search')||'')).join(' · ')}`);

  const results=await Promise.all([...new Set(queries)].map(async target=>{
    try{
      const r=await fetchCardPage(target);
      return {target,...r};
    }catch(e){
      return {target,status:0,text:'',error:e?.message||'timeout'};
    }
  }));

  // First pass: only actual TCGGO card links, never product links.
  for(const r of results){
    const candidates=collectCandidates(r.text,code,number,name);
    if(candidates.length){
      steps.push({
        title:'Carta encontrada',
        ok:true,
        detail:`Primera ficha de carta válida: ${candidates[0].url}`
      });
      return candidates[0].url;
    }
  }

  // Second pass: if the result page uses different formatting, look for any
  // TCGGO card URL near the requested code/number, tolerating 77 vs 077.
  const targetNums=nums.map(rawNumber);
  for(const r of results){
    const re=/https?:\/\/(?:www\.)?tcggo\.com\/pokemon(?:-jp)?\/[^\s)"'<]+/gi;
    let m;
    while((m=re.exec(r.text))){
      const u=m[0];
      const context=r.text.slice(Math.max(0,m.index-800),Math.min(r.text.length,m.index+1200));
      const compact=norm(context).replace(/\s+/g,'');
      const codeOk=compact.includes(norm(code));
      const numOk=targetNums.some(n=>compact.includes(norm(`${code} ${n}`).replace(/\s+/g,'')));
      if(codeOk && numOk){
        const abs=absoluteTcggoUrl(u);
        if(abs){
          steps.push({title:'Carta encontrada',ok:true,detail:`Coincidencia de carta por código/número: ${abs}`});
          return abs;
        }
      }
    }
  }

  steps.push({title:'Búsqueda pública',ok:false,detail:`No se encontró una ficha de carta para ${code} ${number}.`});
  return '';
}

module.exports = async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const steps=[];
  const add=(title,detail,ok=null)=>steps.push({title,detail,ok});
  try{
    const b=req.body||{};
    const code=String(b.code||b.setCode||'').trim().toUpperCase();
    const number=String(b.number||b.collectorNumber||'').trim().split('/')[0];
    const name=String(b.nameEnglish||b.name||'').trim();
    const setName=String(b.setEnglish||b.tcggoSetEnglish||b.set||'').trim();
    const language=String(b.lang||b.language||'Español').trim();
    const cardmarketId=String(b.cardmarketProductId||b.cardmarketId||'').trim();
    if(!code||!number)return res.status(400).json({ok:false,error:'Faltan código y número.',steps});
    add('Entrada',`${code} ${number} · ${language}`,true);
    add('Identidad',`Código + número: ${code} ${number}`,true);
    const searchNums=searchNumberVariants(code,number);
    add('Consulta',`TCGGO probará: ${searchNums.map(n=>`${code} ${n}`).join(' · ')}`,true);

    let card=null;
    let cardPage=null;
    try{card=await apiLookup({name,number,cardmarketId,code,steps,add});}catch(e){
      steps.push({title:'API TCGGO',ok:false,detail:e?.message||'No disponible'});
    }
    if(card?.url){
      add('TCGGO ficha','La API devolvió directamente la ficha exacta.',true);
    }
    if(!card?.url){
      const useDirect = !/^MEP$/i.test(code) && !/^SVP$/i.test(code) && !/^SV9A$/i.test(code);
      const direct=useDirect ? directUrlFromKnown(name,setName,number,code) : '';
      if(direct){
        add('Ruta directa',direct);
        try{
          const page=await fetchCardPage(direct);
          const valid=page.status===200 && identityMatches(page.text,code,number,name);
          steps.push({title:'Ficha directa',ok:valid,detail:`HTTP ${page.status}; ${page.text.length} caracteres`});
          if(valid){card={url:direct,name,cardNumber:number,source:'TCGGO direct'};cardPage=page;}
        }catch(e){steps.push({title:'Ficha directa',ok:false,detail:e?.message||'timeout'});}
      }
    }
    if(!card?.url){
      const publicUrl=await publicSearch({name,number,code,steps,add});
      if(publicUrl)card={url:publicUrl,name,cardNumber:number,source:'TCGGO public search'};
    }
    if(!card?.url){
      return res.status(404).json({ok:false,error:`No se encontró ${code} ${number} en TCGGO mediante búsqueda directa.`,steps});
    }
    add('URL final',card.url,true);
    const page=cardPage||await fetchCardPage(card.url);
    if(!cardPage) steps.push({title:'Página TCGGO',ok:page.status===200,detail:`HTTP ${page.status}; ${page.text.length} caracteres`});
    else steps.push({title:'Página TCGGO',ok:true,detail:`Ficha ya validada; ${page.text.length} caracteres`});
    if(page.status!==200) return res.status(502).json({ok:false,error:'TCGGO no devolvió la ficha.',steps,url:card.url});
    const identity=identityMatches(page.text,code,number,'');
    steps.push({title:'Identidad ficha',ok:identity,detail:identity?`Coincide ${code} ${number}.`:'La ficha no contiene una coincidencia suficiente.'});
    if(!identity)return res.status(409).json({ok:false,error:'La ficha encontrada no coincide exactamente con código+número.',steps,url:card.url});
    const parsed=parseLanguagePrice(page.text,language);
    if(!parsed){
      return res.status(404).json({ok:false,error:`Se encontró ${code} ${number}, pero no el precio ${LANG_LABELS[language]||language} / Europe.`,steps,url:card.url});
    }
    steps.push({title:'Precio EU',ok:true,detail:`${LANG_LABELS[language]||language} · Europe · ${parsed.display}`,price:parsed.price});
    return res.status(200).json({ok:true,price:parsed.price,priceDisplay:parsed.display,url:card.url,steps,source:'TCGGO'});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||'Error interno TCGGO.',steps});
  }
};
