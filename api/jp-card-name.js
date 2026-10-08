// Japanese-card name resolver used by the scanner/manual JP flow.
// It returns the Japanese name plus the international English name used by
// Cardmarket. The existing manual search motor for non-Japanese cards is untouched.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const body=req.body||{};
    const rawCode=String(body.code||'').trim().toUpperCase();
    const number=String(body.number||'').trim().split('/')[0];
    if(!rawCode || !number) return res.status(400).json({error:'Faltan código y número.'});

    const n=String(number).replace(/^0+/,'')||number;
    const codeVariants=[...new Set([
      rawCode,
      rawCode.toLowerCase(),
      /^[A-Z]{1,4}\d+[A-Z]$/.test(rawCode) ? rawCode.slice(0,-1)+rawCode.slice(-1).toLowerCase() : rawCode
    ])];

    const strip=s=>String(s||'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'")
      .replace(/&quot;|&#x22;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
      .replace(/\s+/g,' ').trim();

    const cleanText=s=>strip(String(s||'').replace(/\s+/g,' '));
    const extractCandidates=html=>{
      const out=[];
      const push=v=>{v=cleanText(v); if(v && !out.includes(v)) out.push(v)};
      for(const re of [
        /<h1[^>]*>([\s\S]*?)<\/h1>/i,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
        /<title[^>]*>([\s\S]*?)<\/title>/i
      ]){
        const m=html.match(re); if(m?.[1]) push(m[1]);
      }
      return out;
    };
    const extractEnglishName=html=>{
      const candidates=extractCandidates(html);
      for(const raw of candidates){
        let v=raw
          .replace(/\s*[–—]\s*Limitless.*$/i,'')
          .replace(/\s*\|\s*Limitless.*$/i,'')
          .trim();
        // Typical translated page title: "Ethan's Ho-Oh ex - Heat Wave Arena (SV9a) #77"
        const m=v.match(/^(.+?)\s+[-–—]\s+.+?\s*\([A-Za-z0-9-]+\)\s*#?\d+/);
        if(m?.[1]) v=m[1].trim();
        if(v && !/[\u3040-\u30ff\u3400-\u9fff]/.test(v) && /[A-Za-z]/.test(v)) return v;
      }
      return '';
    };
    const parseName=html=>{
      const candidates=extractCandidates(html);
      return candidates[0]||'';
    };

    let japaneseName='';
    let englishName='';
    let imageUrl='';
    let sourceUrl='';

    // Limitless has the Japanese print and its international translation on the
    // same page. ?translate=en is the reliable bridge from JP code+number to the
    // English name (e.g. SV9A 76 -> Yanmega ex).
    for(const c of codeVariants){
      const base=`https://limitlesstcg.com/cards/jp/${encodeURIComponent(c)}/${encodeURIComponent(n)}`;
      const urls=[`${base}?translate=en`,`${base}?lang=en.t`,`${base}?translate=en&lang=en.t`,base];
      for(const jpUrl of urls){
        try{
          const r=await fetch(jpUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
          if(!r.ok) continue;
          const html=await r.text();
          const name=parseName(html);
          if(name && !/^[A-Za-z0-9 .,'’&+\-:()]+$/.test(name)) japaneseName=name;
          const translated=extractEnglishName(html);
          if(translated) englishName=translated;
          const im=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if(im?.[1]) imageUrl=im[1];
          sourceUrl=jpUrl;
          if(englishName) break;
        }catch(e){}
      }
      if(englishName) break;
    }

    // Fallback: TCGdex English card endpoint. This covers Japanese expansions
    // where Limitless may not have the translated page yet.
    if(!englishName){
      for(const c of codeVariants){
        const ids=[c.toLowerCase(),c.toUpperCase()];
        for(const id of ids){
          const urls=[
            `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id+'-'+n)}`,
            `https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(id)}/${encodeURIComponent(n)}`
          ];
          for(const u of urls){
            try{
              const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
              if(!r.ok) continue;
              const j=await r.json();
              const candidate=String(j?.name||'').trim();
              if(candidate && !/[\u3040-\u30ff\u3400-\u9fff]/.test(candidate)){
                englishName=candidate;
                if(!imageUrl) imageUrl=String(j?.image||'').trim();
                break;
              }
            }catch(e){}
          }
          if(englishName) break;
        }
        if(englishName) break;
      }
    }

    // If we still need the printed Japanese name, fetch the untranslated JP page.
    if(!japaneseName){
      for(const c of codeVariants){
        const jpUrl=`https://limitlesstcg.com/cards/jp/${encodeURIComponent(c)}/${encodeURIComponent(n)}`;
        try{
          const r=await fetch(jpUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
          if(!r.ok) continue;
          const html=await r.text();
          const name=parseName(html);
          if(name) japaneseName=name;
          if(!imageUrl){
            const im=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
              || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            if(im?.[1]) imageUrl=im[1];
          }
          if(japaneseName) break;
        }catch(e){}
      }
    }

    if(!japaneseName && !englishName) return res.status(404).json({error:'Carta no encontrada.'});
    return res.status(200).json({
      name: japaneseName || englishName,
      japaneseName,
      englishName,
      cardmarketNameEnglish: englishName,
      imageUrl,
      source:'Limitless JP',
      sourceUrl
    });
  } catch(e) {
    return res.status(500).json({error:e?.message||'Error interno.'});
  }
};
