function decodeHtml(s){
  return String(s||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/&#x27;/gi,"'")
    .replace(/&#x2F;/gi,'/')
    .replace(/&#([0-9]+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

const LOCALE={
  Español:'es',
  Inglés:'en',
  Francés:'fr',
  Alemán:'de',
  Italiano:'it'
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

function normalize(s){
  return String(s||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g,'');
}

function parseLowest(html){
  const text=cleanText(html);
  const labels='Más bajo|Plus bas|Lowest|Niedrigster|Più basso|Più basso prezzo';
  const re=new RegExp('(?:'+labels+')\\s*(?:[:\\-])?\\s*(\\d+(?:[.,]\\d{1,2})?)\\s*€','i');
  const m=text.match(re);
  if(!m)return null;
  const raw=String(m[1]).trim();
  // Pokedexia uses European formatting such as 350,00 € and 9,40 €.
  const n=raw.includes(',')
    ? Number(raw.replace(/\./g,'').replace(',','.'))
    : Number(raw);
  return Number.isFinite(n)?n:null;
}

function absoluteUrl(href,base){
  try{return new URL(decodeHtml(href),base).toString();}catch(e){return '';}
}

function extractLinks(html,base,code,number,name){
  const wantedCode=normalize(code);
  const wantedNumber=normalize(number);
  const wantedPair=wantedCode+wantedNumber;
  const wantedName=normalize(name);
  const out=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const href=absoluteUrl(m[1],base);
    if(!href||!/pokedexia\.com\//i.test(href))continue;
    if(!/\/(?:es\/cartas-pokemon|en\/pokemon-cards|fr\/cartes-pokemon|de\/pokemon-karten|it\/carte-pokemon)\//i.test(href))continue;

    const txt=cleanText(m[2]);
    const hay=normalize(txt+' '+href);

    // Strong match: exact expansion code + collector number.
    const pairMatch=hay.includes(wantedPair) ||
      new RegExp(wantedCode+'[^0-9]{0,8}0*'+String(number).replace(/^0+/,'')).test(hay);

    // Name is only a secondary signal. This prevents choosing another card
    // with the same Pokémon name when several versions are listed.
    const nameMatch=wantedName && hay.includes(wantedName);

    if(pairMatch || (nameMatch && /-\d{1,4}(?:\/\d{1,4})?(?:["']|$)/.test(m[1]))){
      out.push({href,score:(pairMatch?100:0)+(nameMatch?20:0)});
    }
  }
  return [...new Map(out.map(x=>[x.href,x])).values()]
    .sort((a,b)=>b.score-a.score)
    .map(x=>x.href);
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
    const href=absoluteUrl(m[1],base);
    if(!href)continue;
    const text=cleanText(m[2]).toUpperCase();
    const lm=text.match(/\b(ES|DE|EN|FR|IT)\b/);
    if(lm)out[lm[1].toLowerCase()]=href;
  }
  return out;
}

function buildSearchUrls(name,code,number){
  const urls=[];
  const qName=String(name||'').trim();
  const qPair=(String(code||'')+' '+String(number||'')).trim();

  // Pokedexia documents its card search as a name search. The code+number
  // query is kept as a secondary attempt because some indexed cards expose
  // the collector number in the search results.
  if(qName){
    urls.push('https://pokedexia.com/es/cartas-pokemon?search='+encodeURIComponent(qName));
    urls.push('https://pokedexia.com/en/pokemon-cards?search='+encodeURIComponent(qName));
  }
  if(qPair){
    urls.push('https://pokedexia.com/es/cartas-pokemon?search='+encodeURIComponent(qPair));
  }
  return [...new Set(urls)];
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método no permitido'});

    const code=String(req.query?.code||'').trim().toUpperCase();
    const number=String(req.query?.number||'').trim().split('/')[0];
    const lang=String(req.query?.lang||'Español').trim();
    const name=String(req.query?.name||'').trim();

    const locale=LOCALE[lang];
    if(!code||!number)return res.status(400).json({ok:false,error:'Faltan código y número'});
    if(!locale)return res.status(400).json({ok:false,error:'Pokedexia no dispone de precios para el idioma '+lang});
    if(!name)return res.status(400).json({ok:false,error:'Falta el nombre de la carta para localizarla en Pokedexia'});

    let esPage=null;
    let lastError=null;

    for(const searchUrl of buildSearchUrls(name,code,number)){
      try{
        const search=await getHtml(searchUrl);
        const candidates=extractLinks(search.html,search.url,code,number,name);
        for(const u of candidates){
          try{
            const page=await getHtml(u);
            if(parseLowest(page.html)!==null || /Precio Cardmarket|Prix Cardmarket|Cardmarket Price|Cardmarket Preis|Prezzo Cardmarket/i.test(cleanText(page.html))){
              esPage=page;
              break;
            }
          }catch(e){lastError=e;}
        }
        if(esPage)break;
      }catch(e){lastError=e;}
    }

    if(!esPage){
      return res.status(404).json({
        ok:false,
        error:'Pokedexia no encontró '+code+' '+number+' ('+name+')',
        detail:lastError?String(lastError.message||lastError):undefined
      });
    }

    let targetUrl=esPage.url;
    if(locale!=='es'){
      const alts=alternateLocaleUrls(esPage.html,esPage.url);
      targetUrl=alts[locale]||'';
      if(!targetUrl){
        // Pokedexia localizes the same card under the same slug in the
        // language route. This is only a fallback after checking its links.
        targetUrl=esPage.url.replace('/es/','/'+locale+'/');
      }
    }

    const target=targetUrl===esPage.url?esPage:await getHtml(targetUrl);
    const price=parseLowest(target.html);
    if(price===null){
      return res.status(404).json({
        ok:false,
        error:'No se encontró el precio mínimo de Cardmarket en Pokedexia',
        url:target.url
      });
    }

    return res.status(200).json({
      ok:true,
      price,
      language:lang,
      locale,
      url:target.url,
      source:'Pokedexia/Cardmarket',
      note:'Pokedexia muestra el anuncio más bajo observado; no identifica la condición NM de forma separada.'
    });
  }catch(e){
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando Pokedexia')});
  }
}
