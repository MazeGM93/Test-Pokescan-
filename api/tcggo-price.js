export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const body=req.body||{};
  const code=String(body.code||'').trim().toUpperCase();
  const number=String(body.number||'').trim().split('/')[0];
  const lang=String(body.lang||'Inglés').trim();
  if(!code||!number) return res.status(400).json({ok:false,error:'Faltan código o número'});

  const normalized=normalizeQuery(code,number);
  const query=normalized.code+' '+normalized.number;
  const searchUrl='https://www.tcggo.com/pokemon?search='+encodeURIComponent(query);
  const log=[];
  const add=(s,d='')=>log.push({step:s,detail:String(d||'')});
  add('Consulta preparada',query);
  add('Buscador principal TCGGO',searchUrl);

  try{
    const searchResp=await fetch(searchUrl,{headers:{'user-agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','accept':'text/html,application/xhtml+xml'},cache:'no-store'});
    const searchHtml=await searchResp.text();
    add('Respuesta buscador',searchResp.status+' · '+searchHtml.length+' caracteres');
    if(!searchResp.ok) throw new Error('TCGGO devolvió HTTP '+searchResp.status);

    const first=firstCardResult(searchHtml,query);
    if(!first){
      add('Primera carta','No se encontró ninguna ficha de carta en los resultados');
      return res.status(200).json({ok:false,query,searchUrl,log,error:'No se encontró la primera carta de TCGGO para '+query});
    }
    add('Primera carta',first.name+' · '+first.url);

    const cardResp=await fetch(first.url,{headers:{'user-agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','accept':'text/html,application/xhtml+xml'},cache:'no-store'});
    const cardHtml=await cardResp.text();
    add('Entrada en la ficha',cardResp.status+' · '+cardHtml.length+' caracteres');
    if(!cardResp.ok) throw new Error('La ficha TCGGO devolvió HTTP '+cardResp.status);

    const prices=parseEuPrices(cardHtml);
    add('EU Prices',Object.keys(prices).length?JSON.stringify(prices):'No se encontraron precios europeos');
    const wanted=langKey(lang);
    const price=prices[wanted] ?? prices[lang] ?? null;
    add('Idioma solicitado',lang+' → '+wanted);
    add('Precio seleccionado',price==null?'No encontrado':String(price)+' €');

    const result={ok:price!=null,query,searchUrl,cardUrl:first.url,cardName:first.name,price,prices,language:lang,normalizedCode:normalized.code,normalizedNumber:normalized.number,log};
    return res.status(200).json(result);
  }catch(e){
    add('ERROR',e?.message||String(e));
    return res.status(200).json({ok:false,query,searchUrl,error:e?.message||String(e),log});
  }
}

function normalizeQuery(code,number){
  let n=String(number||'').trim().split('/')[0];
  // TCGGO uses three digits for these promo/MEP collector numbers.
  if(/^(MEP|SVP)$/i.test(code) && /^\d{1,3}$/.test(n)) n=n.padStart(3,'0');
  return {code:String(code||'').toUpperCase(),number:n};
}

function stripHtml(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
function decodeUrl(s){return String(s||'').replace(/&amp;/g,'&').replace(/&#x2F;/gi,'/').replace(/&#47;/g,'/');}
function abs(u){try{return new URL(u,'https://www.tcggo.com').href}catch(e){return ''}}
function firstCardResult(html,query){
  const wanted=String(query||'').toUpperCase().replace(/\s+/g,' ').trim();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const all=[];let m;
  while((m=re.exec(html))){
    const href=decodeUrl(m[1]);
    const text=stripHtml(m[2]);
    if(!/^\/pokemon(?:-jp)?\//i.test(href)) continue;
    if(/\/(?:singles|products|artist|sets?|episodes)\b/i.test(href)) continue;
    if(!/-\d+(?:\?|$)/.test(href)) continue;
    all.push({href,text});
  }
  const exact=all.filter(x=>new RegExp('\\b'+escapeRe(wanted.split(' ')[0])+'\\s*'+escapeRe(wanted.split(' ').slice(1).join(' '))+'\\b','i').test(x.text));
  const pick=(exact[0]||all[0]);
  if(!pick)return null;
  return {name:pick.text||'Carta TCGGO',url:abs(pick.href)};
}
function escapeRe(s){return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function langKey(lang){
  const m={'Español':'Spanish','Inglés':'English','Japonés':'Japanese','Francés':'French','Alemán':'German','Italiano':'Italian','Portugués':'Portuguese','Coreano':'Korean','Chino':'Chinese'};
  return m[lang]||lang;
}
function parseEuPrices(html){
  const out={};
  const clean=stripHtml(html);
  const start=clean.search(/EU Prices/i);
  if(start<0)return out;
  const part=clean.slice(start,start+5000);
  const langs=['English','German','French','Spanish','Italian','Japanese','Korean','Chinese'];
  for(const l of langs){
    const re=new RegExp(l+'(?:\\s+'+l+')?\\s+Europe\\s+([0-9][0-9.,]*)\\s*€','i');
    const m=part.match(re);
    if(m){out[l]=parseEuro(m[1]);}
  }
  return out;
}
function parseEuro(s){
  const x=String(s||'').replace(/\s/g,'');
  if(x.includes(',')) return Number(x.replace(/\./g,'').replace(',','.'));
  const dots=(x.match(/\./g)||[]).length;
  return dots>1?Number(x.replace(/\./g,'')):Number(x);
}
