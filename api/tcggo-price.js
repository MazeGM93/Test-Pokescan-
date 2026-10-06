function decodeHtml(s){
  return String(s||'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&#x2F;/gi,'/')
    .replace(/&#x27;/gi,"'");
}

function cleanText(s){
  return decodeHtml(String(s||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' '))
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeCode(raw){
  return String(raw||'').trim().toUpperCase().replace(/\s+/g,' ');
}

function normalizeNumber(code, raw){
  let n=String(raw||'').trim().split('/')[0].trim();
  if((code==='MEP'||code==='SVP') && /^\d+$/.test(n)) n=n.padStart(3,'0');
  return n;
}

function langName(lang){
  const v=String(lang||'').trim().toLowerCase();
  if(/jap|^ja$|^jp$/.test(v)) return 'Japanese';
  if(/esp|span|^es$/.test(v)) return 'Spanish';
  if(/ing|engl|^en$/.test(v)) return 'English';
  if(/fran|fren|^fr$/.test(v)) return 'French';
  if(/alem|germ|^de$/.test(v)) return 'German';
  if(/ital|^it$/.test(v)) return 'Italian';
  if(/port|^pt$/.test(v)) return 'Portuguese';
  if(/core|kore|^ko$/.test(v)) return 'Korean';
  return 'Spanish';
}

function cardPathIsLikely(href, japanese){
  try{
    const u=new URL(href,'https://www.tcggo.com');
    const p=u.pathname;
    if(japanese ? !p.startsWith('/pokemon-jp/') : !p.startsWith('/pokemon/')) return false;
    const parts=p.split('/').filter(Boolean);
    // /pokemon/<set>/<card-slug> ; exclude catalog landing pages and /singles.
    return parts.length>=3 && !['singles','products','expansions','sets','artist'].includes(parts[parts.length-1].toLowerCase());
  }catch(e){return false;}
}

function firstCardHref(html, code, number, japanese){
  const wantedCode=normalizeCode(code).toLowerCase();
  const wantedNum=String(number).trim().toLowerCase();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates=[];
  let m;
  while((m=re.exec(String(html||'')))){
    const href=decodeHtml(m[1]);
    if(!cardPathIsLikely(href,japanese)) continue;
    const text=cleanText(m[2]);
    const hay=(href+' '+text).toLowerCase();
    // The main searcher is queried with code + number. Prefer the first card
    // whose visible/link text contains that identity, without inventing a slug.
    const codeHit=hay.includes(wantedCode);
    const numHit=hay.includes(wantedNum) || hay.includes(wantedCode.replace(/\s+/g,'-')+'-'+wantedNum);
    if(codeHit && numHit) return new URL(href,'https://www.tcggo.com').href;
  }
  return '';
}

async function fetchPage(url){
  const r=await fetch(url,{headers:{
    'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1',
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'es-ES,es;q=0.9,en;q=0.8'
  }});
  const body=await r.text();
  if(!r.ok) throw new Error('TCGGO respondió HTTP '+r.status);
  return body;
}

function extractEuropePrice(html, wantedLanguage){
  const text=cleanText(html);
  const target=langName(wantedLanguage);
  // TCGGO exposes the EU table as Language | Region | Price. Keep the price
  // tied to the requested language; never use US Market as a substitute.
  const patterns=[
    new RegExp('(?:Language\\s+Region\\s+Price\\s+)?(?:Image\\s+)?'+target+'\\s+(?:'+target+'\\s+)?Europe\\s+(\\d+(?:[.,]\\d{1,2})?)\\s*€','i'),
    new RegExp('(?:Image\\s+)?'+target+'\\s+(?:'+target+'\\s+)?Europe\\s+(\\d+(?:[.,]\\d{1,2})?)\\s*€','i')
  ];
  for(const re of patterns){
    const m=text.match(re);
    if(m){
      const raw=String(m[1]);
      const n=Number(raw.includes(',') ? raw.replace(/\./g,'').replace(',','.') : raw);
      if(Number.isFinite(n)) return {price:n,language:target};
    }
  }
  return null;
}

export default async function handler(req,res){
  try{
    if(req.method!=='GET' && req.method!=='POST') return res.status(405).json({ok:false,error:'Método no permitido'});
    const q=req.method==='POST'?(req.body||{}):(req.query||{});
    const code=normalizeCode(q.code);
    const number=normalizeNumber(code,q.number);
    const language=langName(q.language||q.lang||'Español');
    if(!code||!number) return res.status(400).json({ok:false,error:'Faltan código y número'});

    const japanese=/japanese/i.test(language) || /^(SV\d+[A-Z]|SM\d+[A-Z]|S\d+[A-Z]|M\d+[A-Z])$/i.test(code);
    const base=japanese?'https://www.tcggo.com/pokemon-jp':'https://www.tcggo.com/pokemon';
    const query=encodeURIComponent(code+' '+number);
    // TCGGO's main searcher is the source of truth. We try its normal query
    // parameter variants only because the public site has changed the URL key
    // over time; no API key, RapidAPI, TCGdex or fabricated card URL is used.
    const searchUrls=[
      base+'?search='+query,
      base+'?q='+query,
      base+'?query='+query,
      base+'?searchQuery='+query
    ];
    let cardUrl='';
    let lastErr=null;
    for(const url of searchUrls){
      try{
        const html=await fetchPage(url);
        cardUrl=firstCardHref(html,code,number,japanese);
        if(cardUrl) break;
      }catch(e){lastErr=e;}
    }
    if(!cardUrl) return res.status(404).json({ok:false,error:'No se encontró la primera carta de '+code+' '+number+' en TCGGO',details:lastErr?.message||''});

    const cardHtml=await fetchPage(cardUrl);
    const result=extractEuropePrice(cardHtml,language);
    if(!result) return res.status(404).json({ok:false,error:'La carta de TCGGO no tiene precio europeo para '+language,cardUrl,query:code+' '+number});
    return res.status(200).json({ok:true,price:result.price,priceDisplay:result.price.toFixed(2).replace('.',',')+' €',language:result.language,cardUrl,query:code+' '+number});
  }catch(e){
    return res.status(502).json({ok:false,error:String(e?.message||e||'Error consultando TCGGO')});
  }
}
