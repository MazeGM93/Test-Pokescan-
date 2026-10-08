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
    .toLowerCase()
    .replace(/['’]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
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
  // Primera cifra = índice PokéItem; segunda = Cardmarket (Near Mint).
  return {price:nums[1],pokItemPrice:nums[0],row:row[0]};
}

async function tcgdexFrenchCard(setId, number, code){
  const id=String(setId||'').trim();
  const n=String(number||'').split('/')[0].trim();
  const cleanCode=String(code||'').trim().toUpperCase();
  const candidates=[];
  if(id){
    candidates.push(`https://api.tcgdex.net/v2/fr/sets/${encodeURIComponent(id)}/${encodeURIComponent(n)}`);
    candidates.push(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(id+'-'+n)}`);
  }
  if(!candidates.length && cleanCode){
    const sr=await fetch('https://api.tcgdex.net/v2/fr/sets',{headers:{Accept:'application/json'},cache:'no-store'});
    if(sr.ok){
      const sets=await sr.json();
      const wanted=cleanCode.replace(/[^A-Z0-9]/g,'');
      const found=Array.isArray(sets)?sets.find(s=>{
        const a=String(s?.id||'').replace(/[^A-Z0-9]/g,'').toUpperCase();
        const b=String(s?.code||s?.setCode||'').replace(/[^A-Z0-9]/g,'').toUpperCase();
        return a===wanted||b===wanted;
      }):null;
      if(found?.id){
        const sid=String(found.id);
        candidates.push(`https://api.tcgdex.net/v2/fr/sets/${encodeURIComponent(sid)}/${encodeURIComponent(n)}`);
        candidates.push(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(sid+'-'+n)}`);
      }
    }
  }
  for(const url of [...new Set(candidates)]){
    try{
      const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
      if(!r.ok)continue;
      const c=await r.json();
      if(c?.name && c?.set?.name) return c;
    }catch(e){}
  }
  return null;
}

async function fetchPage(url){
  const r=await fetch(url,{headers:{
    'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)',
    'Accept':'text/html,application/xhtml+xml'
  },redirect:'follow',cache:'no-store'});
  const html=await r.text();
  return {ok:r.ok,status:r.status,url:r.url,html};
}

module.exports = async function handler(req,res){
  const trace=[];
  try{
    if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método no permitido',trace});
    const body=req.body||{};
    const code=String(body.code||'').trim().toUpperCase();
    const number=numberOnly(body.number);
    const language=String(body.language||'Español').trim();
    const setId=String(body.setId||body.tcgdexSetId||'').trim();
    const name=String(body.name||'').trim();
    if(!code||!number) return res.status(400).json({ok:false,error:'Faltan código o número',trace});
    if(language==='Japonés') return res.status(400).json({ok:false,skipped:true,error:'Japonés: se mantiene el sistema actual',trace:['⏭ Japonés: no se consulta PokéItem']});
    if(!LANG_ROW[language]) return res.status(400).json({ok:false,error:'Idioma europeo no soportado por PokéItem: '+language,trace});

    trace.push('1. Datos: '+code+' '+number+' · '+language);
    const card=await tcgdexFrenchCard(setId,number,code);
    if(!card){
      trace.push('2. TCGdex FR: no encontró la carta');
      return res.status(404).json({ok:false,error:'No se pudo obtener la ficha francesa para construir la URL de PokéItem',trace});
    }
    trace.push('2. TCGdex FR: '+String(card.name)+' · '+String(card.set.name));
    const localId=String(card.localId||number).trim();
    const frName=String(card.name).trim();
    const frSet=String(card.set.name).trim();
    const base='https://app.pokeitem.fr/carte/'+slugify(frSet)+'/'+encodeURIComponent(localId)+'-'+slugify(frName);
    const candidates=[base,base.replace('/carte/','/fr/carte/'),base.replace('/carte/','/en/carte/')];
    trace.push('3. PokéItem URL: '+base.replace('https://app.pokeitem.fr',''));

    let page=null;
    for(const url of candidates){
      try{
        const p=await fetchPage(url);
        trace.push('4. HTTP '+p.status+': '+p.url.replace('https://app.pokeitem.fr',''));
        if(p.ok){page=p;break;}
      }catch(e){trace.push('4. Error URL: '+String(e?.message||e));}
    }
    if(!page){
      return res.status(404).json({ok:false,error:'PokéItem no encontró la ficha con la ruta construida',trace,debug:{frName,frSet,localId,candidates}});
    }

    const text=stripHtml(page.html);
    const parsed=parseCardmarketNm(text,language);
    if(parsed.price===null){
      trace.push('5. Ficha abierta, pero no se encontró Cardmarket NM '+language);
      return res.status(404).json({ok:false,error:parsed.reason,trace,debug:{frName,frSet,localId,url:page.url,language}});
    }
    trace.push('5. Cardmarket NM '+language+': '+parsed.price.toFixed(2)+' €');
    return res.status(200).json({ok:true,price:parsed.price,url:page.url,trace,source:'PokéItem → Cardmarket Near Mint',frName,frSet,localId,pokItemPrice:parsed.pokItemPrice||null});
  }catch(e){
    trace.push('ERROR: '+String(e?.message||e));
    return res.status(500).json({ok:false,error:String(e?.message||e||'Error interno'),trace});
  }
}
