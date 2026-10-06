// Scanner-only fallback for Japanese card names.
// The existing manual search endpoint is intentionally untouched.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  try {
    const body=req.body||{};
    const code=String(body.code||'').trim();
    const number=String(body.number||'').trim().split('/')[0];
    if(!code || !number) return res.status(400).json({error:'Faltan código y número.'});

    const n=String(number).replace(/^0+/,'')||number;
    const url='https://limitlesstcg.com/cards/jp/'+encodeURIComponent(code)+'/'+encodeURIComponent(n);
    const r=await fetch(url,{
      headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},
      cache:'no-store'
    });
    if(!r.ok) return res.status(404).json({error:'No encontrada.'});
    const html=await r.text();

    const strip=s=>String(s||'')
      .replace(/<[^>]+>/g,' ')
      .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'")
      .replace(/&quot;|&#x22;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
      .replace(/\s+/g,' ').trim();

    const h1m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    let name=strip(h1m?.[1]||'');
    name=name.replace(/\s*[-–—]\s*(?:[A-Za-z][^<]*?)?\s*\([^)]*\)\s*#?\d+.*$/,'').trim();
    if(!name) return res.status(404).json({error:'Nombre no encontrado.'});

    const im=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    // Para Cardmarket necesitamos el nombre internacional/inglés, no el nombre
    // japonés impreso. Lo resolvemos para CUALQUIER carta japonesa por el mismo
    // código + número. Probamos variantes de mayúsculas/minúsculas porque Limitless
    // normaliza los códigos japoneses de forma distinta según la expansión.
    let englishName='';
    const codeVariants=[...new Set([code, code.toLowerCase(),
      /^[A-Z]{1,4}\d+[A-Z]$/.test(rawCode) ? rawCode.slice(0,-1)+rawCode.slice(-1).toLowerCase() : rawCode])];
    for(const c of codeVariants){
      const enUrls=[
        `https://limitlesstcg.com/cards/en/${encodeURIComponent(c)}/${encodeURIComponent(n)}`,
        `https://limitlesstcg.com/cards/${encodeURIComponent(c)}/${encodeURIComponent(n)}`
      ];
      for(const enUrl of enUrls){
        try{
          const er=await fetch(enUrl,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
          if(!er.ok) continue;
          const eh=await er.text();
          const em=eh.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          let en=strip(em?.[1]||'');
          en=en.replace(/\s*[-–—]\s*(?:[A-Za-z][^<]*?)?\s*\([^)]*\)\s*#?\d+.*$/,'').trim();
          if(en && !/[\u3040-\u30ff\u3400-\u9fff]/.test(en)){englishName=en;break;}
        }catch(e){}
      }
      if(englishName) break;
    }

    return res.status(200).json({
      name: englishName || name,
      japaneseName: name,
      englishName,
      cardmarketNameEnglish:englishName,
      imageUrl:im?.[1]||'',
      source:'Limitless JP',
      sourceUrl:url
    });
  } catch(e) {
    return res.status(500).json({error:e?.message||'Error interno.'});
  }
};
