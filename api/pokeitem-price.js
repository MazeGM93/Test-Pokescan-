function stripHtml(html){
  return String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;|&#x27;/gi,"'")
    .replace(/&#8364;|&euro;/gi,'€')
    .replace(/\s+/g,' ')
    .trim();
}

function decodeEntities(s){
  return String(s||'')
    .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
    .replace(/&#39;|&#x27;|&#039;/gi,"'")
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

function slugify(s){
  return decodeEntities(String(s||''))
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/œ/gi,'oe').replace(/æ/gi,'ae')
    .toLowerCase().replace(/[’']/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function numberOnly(raw){
  const n=String(raw||'').split('/')[0].trim();
  return n.replace(/^0+(?=\d)/,'') || n;
}

const LANG_ROW={
  'Español':'Espagnol',
  'Inglés':'Anglais',
  'Francés':'Français',
  'Alemán':'Allemand',
  'Italiano':'Italien'
};

function normalizeText(s){
  return decodeEntities(String(s||'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function parseCardmarketNm(text, language){
  const wanted=LANG_ROW[language];
  if(!wanted) return {price:null,reason:'Idioma no soportado por la línea Cardmarket de PokéItem'};
  const labels=Object.values(LANG_ROW);
  const nextLabels=labels.filter(x=>x!==wanted).join('|');
  const rowRe=new RegExp(wanted+'\\s+([\\d.,]+)\\s*€[\\s\\S]*?(?=(?:'+nextLabels+')\\s+|Mis actualizado|$)','i');
  const row=text.match(rowRe);
  if(!row) return {price:null,reason:'No se encontró la fila de '+wanted+' en la tabla de idiomas'};
  const nums=[...String(row[0]).matchAll(/(\d+(?:[.,]\d{1,2})?)\s*€/g)].map(m=>Number(m[1].replace(/\./g,'').replace(',','.'))).filter(Number.isFinite);
  if(nums.length<2) return {price:null,reason:'Se encontró la fila, pero no se pudo separar PokéItem de Cardmarket NM'};
  return {price:nums[1],pokItemPrice:nums[0],row:row[0]};
}

async function fetchPage(url){
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},redirect:'follow',cache:'no-store'});
  const html=await r.text();
  return {ok:r.ok,status:r.status,url:r.url,html};
}

function extractLinks(html){
  const out=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(String(html||'')))){
    const href=decodeEntities(m[1]);
    const text=stripHtml(m[2]);
    if(href) out.push({href,text});
  }
  return out;
}

function absolutePokeItemUrl(href){
  const h=String(href||'').trim();
  if(!h) return '';
  if(/^https?:\/\//i.test(h)) return h;
  if(h.startsWith('/')) return 'https://app.pokeitem.fr'+h;
  return 'https://app.pokeitem.fr/'+h;
}

async function findSetPage(expansion, code, trace){
  const catalog=await fetchPage('https://app.pokeitem.fr/collection/cartes');
  trace.push('2. PokéItem catálogo: HTTP '+catalog.status);
  if(!catalog.ok) return null;
  const links=extractLinks(catalog.html);
  const wanted=normalizeText(expansion);
  const codeNorm=normalizeText(code).replace(/ /g,'');
  const candidates=links.filter(x=>/\/collection\/cartes\//i.test(x.href));
  let best=null,score=-1;
  for(const x of candidates){
    const t=normalizeText(x.text);
    let s=0;
    if(wanted && t===wanted)s+=100;
    if(wanted && t.includes(wanted))s+=70;
    if(wanted && wanted.includes(t) && t.length>2)s+=50;
    if(codeNorm && t.replace(/ /g,'')===codeNorm)s+=80;
    if(/pokemon 151/.test(t) && /151/.test(wanted))s+=90;
    if(s>score){score=s;best=x;}
  }
  if(!best || score<50) return null;
  const url=absolutePokeItemUrl(best.href);
  trace.push('3. Expansión PokéItem: '+best.text+' → '+url.replace('https://app.pokeitem.fr',''));
  const page=await fetchPage(url);
  trace.push('4. HTTP '+page.status+': '+page.url.replace('https://app.pokeitem.fr',''));
  return page.ok?page:null;
}

function findCardLink(html, number, name){
  const links=extractLinks(html).filter(x=>/\/carte\//i.test(x.href));
  const n=String(number||'').trim().replace(/^0+(?=\d)/,'');
  const wanted=normalizeText(name);
  let best=null,score=-1;
  for(const x of links){
    const t=normalizeText(x.text);
    const href=String(x.href);
    const m=t.match(/^(\d+)\s*(?:[·•\-:]|$)/);
    const hrefNum=(href.match(/\/(\d+)-/i)||[])[1]||'';
    let s=0;
    if(m && m[1]===n)s+=100;
    if(hrefNum===n)s+=90;
    if(wanted && t.includes(wanted))s+=35;
    if(s>score){score=s;best=x;}
  }
  return score>=90?best:null;
}

module.exports = async function handler(req,res){
  const trace=[];
  try{
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método no permitido',trace});
    const body=req.body||{};
    const code=String(body.code||'').trim().toUpperCase();
    const number=numberOnly(body.number);
    const language=String(body.language||'Español').trim();
    const name=String(body.name||'').trim();
    const expansion=String(body.expansion||'').trim();
    if(!code||!number) return res.status(400).json({ok:false,error:'Faltan código o número',trace});
    if(language==='Japonés') return res.status(400).json({ok:false,skipped:true,error:'Japonés: se mantiene el sistema actual',trace:['⏭ Japonés: no se consulta PokéItem']});
    if(!LANG_ROW[language]) return res.status(400).json({ok:false,error:'Idioma europeo no soportado por PokéItem: '+language,trace});

    trace.push('1. Datos: '+code+' '+number+' · '+language);
    trace.push('2. Datos disponibles: '+(name||'sin nombre')+' · '+(expansion||'sin expansión'));
    const setPage=await findSetPage(expansion,code,trace);
    if(!setPage){
      trace.push('5. No se encontró la expansión en el catálogo de PokéItem');
      return res.status(404).json({ok:false,error:'No se encontró la expansión en PokéItem',trace});
    }
    const card=findCardLink(setPage.html,number,name);
    if(!card){
      trace.push('5. No se encontró '+number+(name?' · '+name:'')+' dentro de la expansión');
      return res.status(404).json({ok:false,error:'No se encontró la carta dentro de la expansión de PokéItem',trace});
    }
    const cardUrl=absolutePokeItemUrl(card.href);
    trace.push('5. Carta encontrada: '+stripHtml(card.text)+' → '+cardUrl.replace('https://app.pokeitem.fr',''));
    const page=await fetchPage(cardUrl);
    trace.push('6. HTTP '+page.status+': '+page.url.replace('https://app.pokeitem.fr',''));
    if(!page.ok) return res.status(404).json({ok:false,error:'La ficha de la carta no se pudo abrir',trace});
    const parsed=parseCardmarketNm(stripHtml(page.html),language);
    if(parsed.price===null){
      trace.push('7. Ficha abierta, pero no se encontró Cardmarket NM '+language);
      return res.status(404).json({ok:false,error:parsed.reason,trace});
    }
    trace.push('7. Cardmarket NM '+language+': '+parsed.price.toFixed(2)+' €');
    return res.status(200).json({ok:true,price:parsed.price,url:page.url,trace,source:'PokéItem → Cardmarket Near Mint',pokItemPrice:parsed.pokItemPrice||null});
  }catch(e){
    trace.push('ERROR: '+String(e?.message||e));
    return res.status(500).json({ok:false,error:String(e?.message||e||'Error interno'),trace});
  }
};
