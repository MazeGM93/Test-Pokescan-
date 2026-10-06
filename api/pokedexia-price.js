function decodeHtml(s){
  return String(s||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/&#x27;/gi,"'")
    .replace(/&#x2F;/gi,'/')
    .replace(/&#([0-9]+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))
}

const LOCALE={
  Español:'es', Inglés:'en', Francés:'fr', Alemán:'de', Italiano:'it'
};

function cleanText(html){
  return decodeHtml(String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ')
    .trim();
}

function parseLowest(html){
  const text=cleanText(html);
  // Pokedexia labels this value "Más bajo" / "Plus bas" / "Lowest", etc.
  const labels='Más bajo|Plus bas|Lowest|Niedrigster|Più basso';
  const re=new RegExp('(?:'+labels+')\\s+(\\d+(?:[.,]\\d{1,2})?)\\s*€','i');
  const m=text.match(re);
  if(!m)return null;
  const n=Number(String(m[1]).replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)?n:null;
}

function absoluteUrl(href,base){
  try{return new URL(decodeHtml(href),base).toString();}catch(e){return '';}
}

function cardLinksFromSearch(html,base,code,number){
  const target=(String(code)+' '+String(number)).toUpperCase().replace(/\s+/g,' ');
  const targetNoSpace=target.replace(/\s/g,'');
  const out=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const href=absoluteUrl(m[1],base);
    if(!href||!/pokedexia\.com\//i.test(href)||!/\/cartas-pokemon\//i.test(href))continue;
    const txt=cleanText(m[2]).toUpperCase().replace(/\s+/g,' ');
    const hay=(txt+' '+href).replace(/\s/g,'');
    if(txt.includes(target)||hay.includes(targetNoSpace)) out.push(href);
  }
  return [...new Set(out)];
}

async function getHtml(url){
  const r=await fetch(url,{redirect:'follow',headers:{
    'user-agent':'Mozilla/5.0 (compatible; PokeScan/1.0)',
    'accept':'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'accept-language':'es-ES,es;q=0.9,en;q=0.8'
  }});
  const body=await r.text();
  if(!r.ok)throw new Error('Pokedexia respondió HTTP '+r.status);
  return {html:body,url:r.url||url};
}

function alternateLocaleUrls(html,base){
  const out={};
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const href=absoluteUrl(m[1],base); if(!href)continue;
    const text=cleanText(m[2]).toUpperCase();
    const lm=text.match(/\b(ES|DE|EN|FR|IT)\b/);
    if(lm)out[lm[1].toLowerCase()]=href;
  }
  return out;
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método no permitido'});
    const code=String(req.query?.code||'').trim().toUpperCase();
    const number=String(req.query?.number||'').trim().split('/')[0];
    const lang=String(req.query?.lang||'Español').trim();
    const locale=LOCALE[lang];
    if(!code||!number)return res.status(400).json({ok:false,error:'Faltan código y número'});
    if(!locale)return res.status(400).json({ok:false,error:'Pokedexia no dispone de precios para el idioma '+lang});

    // Buscamos por código+número en el índice español, que acepta la búsqueda
    // por número/código. Después seguimos el enlace de la misma carta en el
    // idioma solicitado. Así no inventamos slugs localizados.
    const searchUrl='https://pokedexia.com/es/cartas-pokemon?search='+encodeURIComponent(code+' '+number);
    const search=await getHtml(searchUrl);
    const candidates=cardLinksFromSearch(search.html,search.url,code,number);
    if(!candidates.length)return res.status(404).json({ok:false,error:'Pokedexia no encontró '+code+' '+number});

    let esPage=null;
    for(const u of candidates){
      try{
        const p=await getHtml(u);
        if(parseLowest(p.html)!==null || /Precio Cardmarket|Prix Cardmarket|Cardmarket Price/i.test(cleanText(p.html))){esPage=p;break;}
      }catch(e){}
    }
    if(!esPage)return res.status(404).json({ok:false,error:'Pokedexia encontró la carta pero no su bloque de precios'});

    let targetUrl=esPage.url;
    if(locale!=='es'){
      const alts=alternateLocaleUrls(esPage.html,esPage.url);
      targetUrl=alts[locale]||'';
      if(!targetUrl){
        // Fallback: try common locale route by replacing only the locale when
        // the path is already localized by Pokedexia's router.
        targetUrl=esPage.url.replace('/es/','/'+locale+'/');
      }
    }

    const target=targetUrl===esPage.url?esPage:await getHtml(targetUrl);
    const price=parseLowest(target.html);
    if(price===null)return res.status(404).json({ok:false,error:'No se encontró el precio mínimo de Cardmarket en Pokedexia',url:target.url});
    return res.status(200).json({ok:true,price,language:lang,locale,url:target.url,source:'Pokedexia/Cardmarket',note:'Pokedexia muestra el anuncio más bajo observado; no identifica la condición NM de forma separada.'});
  }catch(e){
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Pokedexia')});
  }
}
