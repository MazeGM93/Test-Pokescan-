const LANG_LABELS={
  'Español':'Spanish',
  'Inglés':'English',
  'Francés':'French',
  'Alemán':'German',
  'Italiano':'Italian',
  'Portugués':'Portuguese',
  'Japonés':'Japanese',
  'Coreano':'Korean'
};

const withTimeout=async(url,options={},ms=10000)=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store'});}
  finally{clearTimeout(timer);}
};

function slugify(value){
  return String(value||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/&/g,'and').replace(/['’]/g,'').replace(/[^a-zA-Z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'').toLowerCase();
}
function cleanText(s){
  return String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/gi,'"')
    .replace(/\s+/g,' ').trim();
}
function numNorm(v){return String(v??'').trim().split('/')[0].replace(/^0+/,'')||String(v??'').trim();}
function codeNorm(v){return String(v||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();}
function parseEuro(v){
  const s=String(v||'').replace(/\u00a0/g,' ').replace(/€/g,'').trim();
  if(!s || /^n\/?a$/i.test(s) || /^[-–—]$/.test(s)) return null;
  const cleaned=s.replace(/[^0-9,.-]/g,'');
  if(!cleaned) return null;
  const n=cleaned.includes(',') ? Number(cleaned.replace(/\./g,'').replace(',','.')) : Number(cleaned.replace(/,/g,''));
  return Number.isFinite(n)?n:null;
}
function addStep(steps,label,detail,status='info'){steps.push({label,detail,status});}

function extractExactEuPrice(text,language,steps){
  const wanted=LANG_LABELS[language]||'Spanish';
  const euStart=String(text||'').search(/EU Prices/i);
  if(euStart<0){addStep(steps,'9. Precios EU','No aparece el bloque EU Prices en la página.','error');return null;}
  const eu=String(text).slice(euStart,euStart+18000);
  const stop=eu.search(/US Prices/i);
  const block=stop>0?eu.slice(0,stop):eu;

  // Markdown generado por Jina: Image: Spanish Spanish | Europe | 470 €
  const re=new RegExp('(?:Image:\\s*)?'+wanted.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\s*\\|\\s*Europe\\s*\\|\\s*([^\\n|]+)','i');
  let m=block.match(re);
  if(m){const p=parseEuro(cleanText(m[1]));if(p!=null){addStep(steps,'9. Precio EU','Fila exacta: '+wanted+' + Europe → '+p.toFixed(2)+' €','ok');return p;}}

  // Tabla HTML, por si TCGGO/Jina devuelve HTML en lugar de Markdown.
  const rowRe=/<tr[^>]*>[\\s\\S]*?<td[^>]*>[\\s\\S]*?'+wanted+'[\\s\\S]*?<td[^>]*>[\\s\\S]*?Europe[\\s\\S]*?<td[^>]*>\\s*([^<]+)</i;
  m=block.match(rowRe);
  if(m){const p=parseEuro(cleanText(m[1]));if(p!=null){addStep(steps,'9. Precio EU','Fila HTML exacta: '+wanted+' + Europe → '+p.toFixed(2)+' €','ok');return p;}}

  addStep(steps,'9. Precio EU','La carta existe, pero no hay una fila exacta para '+wanted+' / Europe.','error');
  return null;
}

async function fetchTcggPage(url,steps){
  const proxy='https://r.jina.ai/'+url;
  try{
    const r=await withTimeout(proxy,{headers:{Accept:'text/plain, text/markdown;q=0.9,*/*;q=0.8','User-Agent':'PokeScan/1.0'}},10000);
    const text=await r.text();
    addStep(steps,'6. TCGGO página','Proxy HTTP '+r.status+'; '+text.length+' caracteres',r.ok?'ok':'error');
    if(!r.ok || text.length<200) return {ok:false,text};
    return {ok:true,text};
  }catch(e){
    addStep(steps,'6. TCGGO página',e?.name==='AbortError'?'Timeout de 10 s consultando TCGGO.':(e?.message||'Error de red.'),'error');
    return {ok:false,text:''};
  }
}

function directCandidates(setNameEnglish,nameEnglish,number){
  const setSlug=slugify(setNameEnglish);
  const nameSlug=slugify(nameEnglish);
  const n=String(number||'').trim().split('/')[0];
  if(!setSlug||!nameSlug||!n) return [];
  const encodedName=encodeURIComponent(nameSlug+'-'+slugify(n));
  const base='https://www.tcggo.com/pokemon/'+encodeURIComponent(setSlug)+'/';
  return [
    base+encodedName,
    base+encodeURIComponent(nameSlug+'-'+String(n).toLowerCase())
  ].filter((u,i,a)=>a.indexOf(u)===i);
}

async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const steps=[];
  const body=req.body||{};
  const code=String(body.code||'').trim().toUpperCase();
  const number=String(body.number||body.localId||'').trim().split('/')[0];
  const nameEnglish=String(body.nameEnglish||body.cardmarketNameEnglish||'').trim();
  const setNameEnglish=String(body.setNameEnglish||body.setName||body.expansionEnglish||'').trim();
  const language=String(body.language||'Español').trim();
  const wantedLabel=LANG_LABELS[language]||'Spanish';

  addStep(steps,'1. Entrada',`${code} ${number} · idioma ${language}`,'ok');
  addStep(steps,'2. Identidad','Código + número son la identidad principal: '+code+' '+number,'ok');
  addStep(steps,'3. Datos TCGdex',`${nameEnglish||'sin nombre inglés'} · ${setNameEnglish||'sin expansión inglesa'}`,nameEnglish&&setNameEnglish?'ok':'error');

  if(!code||!number||!nameEnglish||!setNameEnglish){
    return res.status(400).json({error:'Faltan datos dinámicos de TCGdex para consultar TCGGO.',steps});
  }

  const candidates=directCandidates(setNameEnglish,nameEnglish,number);
  addStep(steps,'4. Ruta TCGGO','Construida dinámicamente: expansión + nombre inglés + número','info');
  if(candidates.length===0)return res.status(404).json({error:'No se pudo construir la ruta TCGGO.',steps});

  let finalUrl=''; let pageText='';
  for(let i=0;i<candidates.length;i++){
    const url=candidates[i];
    addStep(steps,'5. Candidato '+(i+1),url,'info');
    const page=await fetchTcggPage(url,steps);
    if(!page.ok)continue;
    const norm=page.text;
    const codeMarker=new RegExp('(?:\\(|\\b)'+code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\s*'+String(number).replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'(?:\\)|\\b)','i');
    const numberMarker=new RegExp('(?:Card number|'+code.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+')\\s*[:#]?\\s*'+String(number).replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i');
    if(codeMarker.test(norm)||numberMarker.test(norm)){
      finalUrl=url;pageText=norm;
      addStep(steps,'7. Carta encontrada','Coincide '+code+' '+number+' en la página individual.','ok');
      break;
    }
    addStep(steps,'7. Carta encontrada','La página respondió, pero no contiene de forma verificable '+code+' '+number+'.','error');
  }

  if(!finalUrl){
    return res.status(404).json({error:`TCGGO no confirmó ${code} ${number} mediante la ruta dinámica.`,steps});
  }

  const price=extractExactEuPrice(pageText,language,steps);
  if(price==null){
    return res.status(404).json({error:`TCGGO encontró ${code} ${number}, pero no tiene precio ${wantedLabel} / Europe en esa ficha.`,url:finalUrl,steps});
  }

  addStep(steps,'10. Resultado',`${price.toFixed(2)} € · ${language} / Europe`,'ok');
  return res.status(200).json({price,language,region:'Europe',code,number,url:finalUrl,steps,source:'TCGGO'});
}

module.exports=handler;
