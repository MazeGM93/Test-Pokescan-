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
  // Card numbers are frequently printed with leading zeroes (MEP 033,
  // SVP 014, SV9A 077). Compare the numeric part semantically, not literally.
  const escapedCode=escRe(norm(code));
  const escapedN=escRe(n);
  const hasCodeNum=new RegExp('\\b'+escapedCode+'\\s*0*'+escapedN+'\\b','i').test(t);
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
    const ok=identityMatches(context||text,code,number,name) ||
      identityMatches(u,code,number,'');
    if(ok){seen.add(u);out.push({url:u,context:String(context||'').slice(0,1200)});}
  };
  // Markdown links
  let m;
  const md=/\]\((https?:\/\/(?:www\.)?tcggo\.com\/pokemon(?:-jp)?\/[^)\s]+)\)/gi;
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
  const href=/href=["'](\/pokemon(?:-jp)?\/[^"']+)["']/gi;
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
function directUrlFromKnown(nameEnglish,setName,number){
  const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  if(!nameEnglish||!number)return '';
  if(!setName)return '';
  return `https://www.tcggo.com/pokemon/${slug(setName)}/${slug(nameEnglish)}-${rawNumber(number)}`;
}
async function fetchCardPage(url){
  const proxy='https://r.jina.ai/'+url;
  const r=await fetchTimeout(proxy,{headers:{Accept:'text/plain'}},7000);
  const text=await r.text();
  return {status:r.status,text,url};
}
function languageCodeForTcggo(language){
  const x=String(language||'').trim().toLowerCase();
  return ({
    'español':'es','spanish':'es','es':'es',
    'inglés':'en','english':'en','en':'en',
    'francés':'fr','french':'fr','fr':'fr',
    'alemán':'de','german':'de','de':'de',
    'italiano':'it','italian':'it','it':'it',
    'japonés':'jp','japanese':'jp','ja':'jp','jp':'jp',
    'coreano':'kr','korean':'kr','ko':'kr'
  })[x]||'en';
}
function tcggoGameForLanguage(language){
  return languageCodeForTcggo(language)==='jp'?'pokemon-jp':'pokemon';
}
function tcggoCardmarketPrice(card, language){
  const lang=languageCodeForTcggo(language);
  const cm=card?.prices?.cardmarket||{};
  const key=lang==='jp'?'lowest_near_mint_JP':`lowest_near_mint_${lang.toUpperCase()}`;
  const euKey=lang==='jp'?'lowest_near_mint_JP_EU_only':`lowest_near_mint_${lang.toUpperCase()}_EU_only`;
  const v=cm[key];
  const eu=cm[euKey];
  const price=Number.isFinite(Number(eu))?Number(eu):Number.isFinite(Number(v))?Number(v):null;
  if(price===null)return null;
  return {price,display:`${price.toFixed(2).replace('.',',')} €`,language:lang,region:'Europe'};
}
function slugifyTcggo(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
async function tcggoApiSearch({name,number,code,language,cardmarketId,steps,add}){
  const key=String(process.env.TCGGO_API_KEY||'').trim();
  if(!key){add('TCGGO API','No hay TCGGO_API_KEY; se usa la búsqueda pública.',null);return null;}
  const lang=languageCodeForTcggo(language);
  const game=tcggoGameForLanguage(language);
  const n=rawNumber(number);
  const base=`https://cardmarket-api-tcg.p.rapidapi.com/v1/tcgapi/${game}/cards/search`;
  const queries=[];
  const makeQuery=(extra={})=>{
    const p=new URLSearchParams({card_number:n,sort:'relevance',per_page:'20',...extra});
    if(name)p.set('name',name);
    if(cardmarketId)p.set('cardmarket_id',cardmarketId);
    // TCGGO uses lang=jp for the Japanese catalog.
    if(lang==='jp')p.set('lang','jp');
    return `${base}?${p.toString()}`;
  };
  // First query: name + number, then number-only. We always filter the
  // returned records again by episode code so a duplicate card number cannot win.
  queries.push(makeQuery());
  queries.push(makeQuery({name:''}));
  add('TCGGO API',`Búsqueda oficial TCGGO: ${game}/cards/search · ${code} ${n}${name?` · ${name}`:''}`,null);
  let all=[];
  for(const url of [...new Set(queries)]){
    try{
      const r=await fetchTimeout(url,{headers:{
        'x-rapidapi-key':key,
        'x-rapidapi-host':'cardmarket-api-tcg.p.rapidapi.com',
        'Accept':'application/json'
      }},9000);
      const j=await r.json().catch(()=>null);
      steps.push({title:'API TCGGO',ok:r.ok&&!!j,detail:`HTTP ${r.status} · ${game}/cards/search`,data:{url,status:r.status}});
      if(!r.ok||!j)continue;
      const arr=Array.isArray(j?.data)?j.data:Array.isArray(j?.results)?j.results:[];
      all.push(...arr);
    }catch(e){
      steps.push({title:'API TCGGO',ok:false,detail:e?.message||'Error consultando la API.'});
    }
  }
  const normCode=String(code||'').trim().toUpperCase();
  const normName=norm(name);
  const exact=all.find(c=>{
    const cn=rawNumber(c?.card_number??c?.number??'');
    const episodeCode=String(c?.episode?.code||c?.set?.code||'').trim().toUpperCase();
    const sameNum=cn===n;
    const sameCode=!normCode||episodeCode===normCode;
    const cnCode=String(c?.card_code_number||'').toUpperCase().replace(/\s+/g,' ');
    const sameCodeNumber=cnCode===`${normCode} ${n}` || cnCode.endsWith(` ${n}`)&&cnCode.startsWith(normCode);
    const cardName=norm(String(c?.name||''));
    const sameName=!normName||cardName===normName||cardName.includes(normName)||normName.includes(cardName);
    return sameNum&&(sameCode||sameCodeNumber)&&sameName;
  }) || all.find(c=>{
    const cn=rawNumber(c?.card_number??c?.number??'');
    const episodeCode=String(c?.episode?.code||c?.set?.code||'').trim().toUpperCase();
    return cn===n && episodeCode===normCode;
  });
  if(!exact)return null;
  const ep=exact.episode||exact.set||{};
  const epSlug=String(ep.slug||'').trim();
  const cardSlug=String(exact.slug||'').trim();
  const gameRoot=lang==='jp'?'pokemon-jp':'pokemon';
  const urls=[];
  if(exact.url)urls.push(String(exact.url));
  if(exact.tcggo_url)urls.push(String(exact.tcggo_url));
  if(epSlug&&cardSlug){
    // TCGGO sometimes appends an internal duplicate suffix to the URL
    // (e.g. MEP 033 -> mega-lucario-ex-2). The canonical no-suffix URL is
    // tried first; the resolver below also checks the listing/search.
    urls.push(`https://www.tcggo.com/${gameRoot}/${epSlug}/${cardSlug}-${n}`);
    if(String(n)!==String(number))urls.push(`https://www.tcggo.com/${gameRoot}/${epSlug}/${cardSlug}-${String(number).replace(/^0+/,'')}`);
  }
  const price=tcggoCardmarketPrice(exact,language);
  return {
    id:exact.id||exact.tcggo_id||'',
    url:urls[0]||'',
    candidateUrls:[...new Set(urls)],
    name:exact.name||name,
    cardNumber:exact.card_number||number,
    cardmarketId:exact.cardmarket_id||exact.links?.cardmarket_id||cardmarketId||'',
    card:exact,
    price,
    source:'TCGGO API'
  };
}

async function findPublicCardFromApiResult(card,code,number,language,name,steps,add){
  const candidates=[...(card?.candidateUrls||[]),card?.url].filter(Boolean);
  // If TCGGO's API gives an internal ID, use the expansion listing/search to
  // obtain the actual public URL. This handles duplicate-name slugs such as
  // MEP 033 -> mega-lucario-ex-2 instead of guessing the suffix.
  const c=card?.card||{};
  const ep=c.episode||c.set||{};
  const epSlug=String(ep.slug||'').trim();
  const root=languageCodeForTcggo(language)==='jp'?'pokemon-jp':'pokemon';
  const n=rawNumber(number);
  if(epSlug){
    const searches=[
      `https://www.tcggo.com/${root}/${epSlug}/singles?search=${encodeURIComponent(`${code} ${n}`)}`,
      `https://www.tcggo.com/${root}/${epSlug}/singles?search=${encodeURIComponent(n)}`,
      `https://www.tcggo.com/${root}/${epSlug}/singles?search=${encodeURIComponent(name||'')}`
    ];
    for(const target of searches){
      try{
        const page=await fetchCardPage(target);
        if(page.status!==200)continue;
        const hits=collectCandidates(page.text,code,n,name);
        if(hits.length){
          add('Ficha TCGGO','La búsqueda de la expansión devolvió la URL exacta.',true);
          return hits[0].url;
        }
      }catch(e){}
    }
  }
  // Validate the canonical candidates returned/derived from the API.
  for(const u of candidates){
    try{
      const page=await fetchCardPage(u);
      if(page.status===200 && identityMatches(page.text,code,n,name))return u;
    }catch(e){}
  }
  // Last deterministic fallback for duplicate-name URLs: try small numeric
  // suffixes instead of inventing a single suffix.
  const epSlug2=epSlug;
  const cardSlug=String(c.slug||'').trim();
  if(epSlug2&&cardSlug){
    for(let suffix=1;suffix<=12;suffix++){
      const u=`https://www.tcggo.com/${root}/${epSlug2}/${cardSlug}-${suffix}`;
      try{
        const page=await fetchCardPage(u);
        if(page.status===200&&identityMatches(page.text,code,n,name))return u;
      }catch(e){}
    }
  }
  return '';
}

async function publicSearch({name,number,code,language,steps,add}){
  const q1=`${code||''} ${rawNumber(number)}`.trim();
  const q2=`${name||''} ${rawNumber(number)}`.trim();
  const isJp=String(language||'').trim()==='Japonés' || /^JA$/i.test(String(language||'').trim());
  const roots=isJp?['pokemon-jp']:['pokemon'];
  const urls=[];
  for(const root of roots){
    urls.push(
      `https://www.tcggo.com/${root}/singles?search=${encodeURIComponent(q1)}`,
      `https://www.tcggo.com/${root}/singles?search=${encodeURIComponent(q2)}`,
      `https://www.tcggo.com/${root}?search=${encodeURIComponent(q1)}`,
      `https://www.tcggo.com/${root}?search=${encodeURIComponent(q2)}`
    );
  }
  add('Búsqueda TCGGO',isJp
    ? 'Buscando en el catálogo japonés TCGGO por código+número y nombre+número.'
    : 'Buscando por código+número/nombre+número, sin usar el nombre de la expansión.');
  const results=await Promise.all([...new Set(urls)].map(async target=>{
    try{
      const r=await fetchCardPage(target);
      return {target,...r};
    }catch(e){return {target,status:0,text:'',error:e?.message||'timeout'};}
  }));
  for(const r of results){
    const candidates=collectCandidates(r.text,code,number,name);
    if(candidates.length){
      steps.push({title:'Búsqueda pública',ok:true,detail:`Encontrada coincidencia en ${new URL(r.target).pathname}`});
      return candidates[0].url;
    }
  }
  steps.push({title:'Búsqueda pública',ok:false,detail:isJp?'No devolvió una ficha japonesa exacta.':'No devolvió una ficha exacta; se intenta la vía alternativa.'});
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

    let card=null;
    let cardPage=null;
    let apiCard=null;
    try{
      apiCard=await tcggoApiSearch({name,number,code,language,cardmarketId,steps,add});
      if(apiCard){
        // The API itself is now the source of truth for code + number.
        // Keep the exact language price returned by TCGGO instead of scraping
        // a generic price from a possibly different edition.
        if(apiCard.price?.price!=null){
          add('Precio API',`${apiCard.price.language.toUpperCase()} · Europe · ${apiCard.price.display}`,true);
        }
        const exactPublic=await findPublicCardFromApiResult(apiCard,code,number,language,name,steps,add);
        if(exactPublic){
          card={...apiCard,url:exactPublic};
          add('TCGGO ficha','La API identificó la carta y se resolvió la URL pública exacta.',true);
          try{
            const page=await fetchCardPage(exactPublic);
            if(page.status===200){cardPage=page;}
          }catch(e){}
        }else if(apiCard.url){
          // Do not fail the price lookup just because the public slug has a
          // duplicate suffix. The API record is already an exact identity.
          card=apiCard;
          add('TCGGO ficha','La API identificó la carta exacta; no fue necesario adivinar la URL.',true);
        }
      }
    }catch(e){
      steps.push({title:'API TCGGO',ok:false,detail:e?.message||'No disponible'});
    }
    // If the API is unavailable, retain the existing public fallback. For
    // Japanese cards it MUST use pokemon-jp, not the western pokemon catalog.
    if(!card?.url){
      const langCode=languageCodeForTcggo(language);
      const root=langCode==='jp'?'pokemon-jp':'pokemon';
      const setSlug=slugifyTcggo(setName);
      const nameSlug=slugifyTcggo(name);
      const directCandidates=[];
      if(setSlug&&nameSlug){
        directCandidates.push(
          `https://www.tcggo.com/${root}/${setSlug}/${nameSlug}-${rawNumber(number)}`
        );
      }
      // Keep the old occidental direct URL as a final compatibility fallback.
      const oldDirect=directUrlFromKnown(name,setName,number);
      if(oldDirect && !directCandidates.includes(oldDirect))directCandidates.push(oldDirect);
      for(const direct of directCandidates){
        add('Ruta directa',direct);
        try{
          const page=await fetchCardPage(direct);
          const valid=page.status===200 && identityMatches(page.text,code,number,name);
          steps.push({title:'Ficha directa',ok:valid,detail:`HTTP ${page.status}; ${page.text.length} caracteres`});
          if(valid){card={url:direct,name,cardNumber:number,source:'TCGGO direct'};cardPage=page;break;}
        }catch(e){steps.push({title:'Ficha directa',ok:false,detail:e?.message||'timeout'});}
      }
    }
    if(!card?.url){
      const publicUrl=await publicSearch({name,number,code,language,steps,add});
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
    const identity=identityMatches(page.text,code,number,name);
    steps.push({title:'Identidad ficha',ok:identity,detail:identity?`Coincide ${code} ${number}.`:'La ficha no contiene una coincidencia suficiente.'});
    if(!identity)return res.status(409).json({ok:false,error:'La ficha encontrada no coincide exactamente con código+número.',steps,url:card.url});
    // Prefer the exact language/region price returned by the TCGGO API.
    // Only scrape the public page when the API did not provide that price.
    let parsed=apiCard?.price||null;
    if(!parsed) parsed=parseLanguagePrice(page.text,language);
    if(!parsed){
      return res.status(404).json({ok:false,error:`Se encontró ${code} ${number}, pero no el precio ${LANG_LABELS[language]||language} / Europe.`,steps,url:card.url});
    }
    steps.push({title:'Precio EU',ok:true,detail:`${LANG_LABELS[language]||language} · Europe · ${parsed.display}`,price:parsed.price});
    return res.status(200).json({ok:true,price:parsed.price,priceDisplay:parsed.display,url:card.url,steps,source:'TCGGO'});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message||'Error interno TCGGO.',steps});
  }
};
