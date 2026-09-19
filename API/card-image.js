module.exports = async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end();
  try{
    const q=req.query||{};
    const setId=String(q.setId||'').trim();
    const code=String(q.code||'').trim().toUpperCase();
    const rawNumber=String(q.number||'').trim().split('/')[0];
    const number=code==='30C' ? rawNumber.padStart(3,'0') : (rawNumber.replace(/^0+/,'')||rawNumber);
    const lang=String(q.lang||'en').toLowerCase()==='es'?'es':'en';
    const sourceUrl=String(q.sourceUrl||'').trim();
    const rawUrl=String(q.url||'').trim();
    const headers={'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'};
    const imageHeaders={'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'};
    const imageFromCard=card=>{
      const v=String(card?.image||card?.imageUrl||'').trim();
      if(!v)return [];
      if(/\.(?:png|jpg|jpeg|webp)(?:$|[?#])/i.test(v))return [v];
      return [v.replace(/\/$/,'')+'/high.webp',v.replace(/\/$/,'')+'/high.png',v.replace(/\/$/,'')+'/low.webp'];
    };
    const serve=async url=>{
      if(!url)return false;
      try{
        const r=await fetch(url,{headers:imageHeaders,cache:'no-store'});
        if(!r.ok)return false;
        const type=r.headers.get('content-type')||'image/png';
        const buf=Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public,max-age=86400,s-maxage=86400');
        res.status(200).send(buf);return true;
      }catch(e){return false;}
    };

    // PRINCIPAL: TCGdex. La identidad es setId + número, nunca el nombre.
    if(setId&&number){
      const langs=[lang,lang==='es'?'en':'es'];
      for(const lg of langs){
        for(const endpoint of [
          `https://api.tcgdex.net/v2/${lg}/sets/${encodeURIComponent(setId)}/${encodeURIComponent(number)}`,
          `https://api.tcgdex.net/v2/${lg}/cards/${encodeURIComponent(setId+'-'+number)}`
        ]){
          try{
            const r=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});
            if(!r.ok)continue;
            const card=await r.json();
            for(const u of imageFromCard(card))if(await serve(u))return;
          }catch(e){}
        }
      }
    }

    // SEGUNDO: imagen que devolvió la fuente externa, si la tenemos.
    if(rawUrl){
      try{
        const u=new URL(rawUrl);
        const allowed=/((^|\.)limitlesstcg\.com$)|((^|\.)limitlesstcg\.nyc3\.cdn\.digitaloceanspaces\.com$)|((^|\.)pokedexia\.com$)|((^|\.)cdn\.pokedexia\.com$)/i;
        if(allowed.test(u.hostname)&&await serve(u.href))return;
      }catch(e){}
    }

    // TERCERO: recuperar og:image de la ficha externa exacta.
    if(sourceUrl){
      try{
        const r=await fetch(sourceUrl,{headers,cache:'no-store'});
        if(r.ok){
          const html=await r.text();
          const m=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if(m&&m[1]){const u=new URL(m[1],sourceUrl).href;if(await serve(u))return;}
        }
      }catch(e){}
    }
    res.status(404).end();
  }catch(e){res.status(500).end();}
};
