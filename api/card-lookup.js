
async function findCardmarketExact(code, number, preferredLang='en') {
  const cleanCode=String(code||'').trim().toUpperCase();
  const rawNum=String(number||'').split('/')[0].trim();
  const cleanNum=rawNum.replace(/^0+/,'') || rawNum;
  const numCandidates=[...new Set([rawNum,cleanNum,cleanNum.padStart(3,'0')].filter(Boolean))];
  if(!cleanCode || !rawNum) return null;
  const queries=[...new Set(numCandidates.flatMap(n=>[cleanCode+n,cleanCode+' '+n]))];
  for(const q of queries){
    const url='https://www.cardmarket.com/en/Pokemon/Products/Search?searchString='+encodeURIComponent(q)+'&searchMode=v2&mode=gallery';
    try{
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
      if(!r.ok) continue;
      const html=await r.text();
      const re=/href=["']([^"']*\/Products\/Singles\/[^"']+)["']/gi;
      let m;
      while((m=re.exec(html))){
        let href=m[1].replace(/&amp;/g,'&');
        if(href.startsWith('/')) href='https://www.cardmarket.com'+href;
        let absolute='';
        try{absolute=new URL(href,'https://www.cardmarket.com').toString();}catch(e){continue;}
        const path=decodeURIComponent(new URL(absolute).pathname);
        const tail=path.split('/').pop()||'';
        const compact=tail.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
        const wantedCandidates=numCandidates.map(n=>(cleanCode+n).replace(/[^A-Za-z0-9]/g,'').toUpperCase());
        const matchedMarker=wantedCandidates.find(w=>compact.endsWith(w));
        if(!matchedMarker) continue;
        const parts=path.split('/').filter(Boolean);
        const setSlug=parts.length>=2?parts[parts.length-2]:'';
        const marker=matchedMarker;
        const markerRe=new RegExp('[-_]?'+marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
        let cardSlug=tail.replace(markerRe,'').replace(/[-_]+$/,'');
        let name=decodeURIComponent(cardSlug).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
        if(name) name=name.replace(/\bEx\b/g,'ex');
        const setName=decodeURIComponent(setSlug).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
        const langId=({es:4,en:1,fr:2,de:3,it:5,pt:8,ja:7,ko:10}[String(preferredLang||'en').toLowerCase()]||1);
        const exact=absolute+(absolute.includes('?')?'&':'?')+'language='+langId;
        return {name, imageUrl:'', cardmarketExactUrl:exact, cardmarketNameEnglish:name, set:{id:setSlug,name:setName}, source:'Cardmarket', sourceUrl:absolute};
      }
    }catch(e){}
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body=req.body||{};
    const setId=String(body.setId||'').trim();
    const code=String(body.code||body.setCode||'').trim().toUpperCase();
    const localId=String(body.localId||body.number||'').trim();
    const langs=Array.isArray(body.langs)&&body.langs.length?body.langs.map(x=>String(x).trim()).filter(Boolean):['en','es'];
    if(!localId||(!setId&&!code))return res.status(400).json({error:'Faltan código y número de carta.'});
    const cleanNum=localId.split('/')[0].trim();
    const uniqueLangs=[...new Set(langs)];
    const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;|&#x22;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
    const strip=x=>decode(String(x||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

    // Convierte la ruta de imagen que entrega TCGdex en la URL REAL del archivo.
    // La guardamos y devolvemos tal cual para que PokeScan no tenga que volver a
    // adivinar la ruta de la imagen al abrir la colección.
    const resolveTcgdexImage=async image=>{
      const base=String(image||'').trim();
      if(!base)return '';
      const candidates=/\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(base)
        ? [base]
        : [base.replace(/\/$/,'')+'/high.webp',base.replace(/\/$/,'')+'/high.png',base.replace(/\/$/,'')+'/low.webp'];
      for(const u of candidates){
        try{
          const hr=await fetch(u,{method:'HEAD',headers:{Accept:'image/*'},cache:'no-store'});
          if(hr.ok && String(hr.headers.get('content-type')||'').toLowerCase().startsWith('image/')) return u;
        }catch(e){}
        try{
          const gr=await fetch(u,{headers:{Accept:'image/*'},cache:'no-store'});
          if(gr.ok && String(gr.headers.get('content-type')||'').toLowerCase().startsWith('image/')){
            await gr.arrayBuffer();
            return u;
          }
        }catch(e){}
      }
      return '';
    };

    // 0) Descubrimiento dinámico del set: si PokeScan todavía no conoce el código,
    // intentamos localizarlo en el listado de TCGdex antes de caer en Limitless.
    // Esto es especialmente importante para expansiones japonesas nuevas (SVxx, Mxx, etc.).
    let discoveredSetId=setId;
    let discoveredSetName='';
    if(!discoveredSetId && code){
      const discoveryLangs=[...new Set(uniqueLangs.map(x=>String(x).toLowerCase()).concat(['ja','en','es']))];
      for(const lang of discoveryLangs){
        try{
          const sr=await fetch(`https://api.tcgdex.net/v2/${encodeURIComponent(lang)}/sets`,{headers:{Accept:'application/json'},cache:'no-store'});
          if(!sr.ok) continue;
          const sets=await sr.json();
          if(!Array.isArray(sets)) continue;
          const targetCode=code.replace(/[^A-Z0-9]/g,'').toUpperCase();
          const found=sets.find(s=>{
            const sid=String(s?.id||'').replace(/[^A-Z0-9]/g,'').toUpperCase();
            const sc=String(s?.code||s?.setCode||'').replace(/[^A-Z0-9]/g,'').toUpperCase();
            return sid===targetCode || sc===targetCode;
          });
          if(found?.id){
            discoveredSetId=String(found.id).trim();
            discoveredSetName=strip(found.name||found.officialName||'');
            break;
          }
        }catch(e){}
      }
    }

    // 1) TCGdex: fuente principal. Si responde, devolvemos también su imagen.
    if(discoveredSetId){
      for(const lang of uniqueLangs){
        const urls=[
          `https://api.tcgdex.net/v2/${encodeURIComponent(lang)}/sets/${encodeURIComponent(discoveredSetId)}/${encodeURIComponent(cleanNum)}`,
          `https://api.tcgdex.net/v2/${encodeURIComponent(lang)}/cards/${encodeURIComponent(discoveredSetId+'-'+cleanNum)}`
        ];
        for(const url of urls){
          try{
            const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});
            if(!r.ok)continue;
            const card=await r.json();
            if(card&&String(card.name||'').trim()){
              const image=String(card.image||'').trim();
              const imageUrl=await resolveTcgdexImage(image);
              let englishName=String(card.name||'').trim();
              // Si la búsqueda preferida fue español, recuperamos también el nombre
              // inglés para construir slugs exactos de Cardmarket cuando sea posible.
              if(String(lang).toLowerCase()!=='en'){
                try{
                  const enUrl=`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(discoveredSetId+'-'+cleanNum)}`;
                  const er=await fetch(enUrl,{headers:{Accept:'application/json'},cache:'no-store'});
                  if(er.ok){const ec=await er.json();if(ec&&String(ec.name||'').trim())englishName=String(ec.name).trim();}
                }catch(e){}
              }
              const cardmarketProductId=String(card?.pricing?.cardmarket?.idProduct||card?.thirdParty?.cardmarket||'').trim();
              return res.status(200).json({...card,image,imageUrl:imageUrl||image,cardmarketProductId,cardmarketNameEnglish:englishName,source:'TCGdex',sourceUrl:url});
            }
          }catch(e){}
        }
      }
    }

    // 2) Limitless: respaldo por código + número exactos, sin buscar por nombre.
    // 30C usa números de tres cifras en Cardmarket/TCG, pero Limitless puede
    // publicar la ficha con el número sin ceros iniciales. Probamos ambas formas.
    if(code){
      const nums=[cleanNum];
      const unpadded=String(cleanNum).replace(/^0+/,'')||String(cleanNum);
      if(unpadded && unpadded!==cleanNum) nums.push(unpadded);
      const urls=[];
      for(const n of nums){
        for(const lang of uniqueLangs){
          const l=String(lang).toLowerCase()==='es'?'es':'en';
          urls.push(`https://limitlesstcg.com/cards/${l}/${encodeURIComponent(code)}/${encodeURIComponent(n)}`);
        }
        urls.push(`https://limitlesstcg.com/cards/${encodeURIComponent(code)}/${encodeURIComponent(n)}`);
      }
      for(const url of [...new Set(urls)]){
        try{
          const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
          if(!r.ok)continue;
          const html=await r.text();
          const first=(re)=>{const m=html.match(re);return m&&m[1]?strip(m[1]):''};
          const heading=first(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const ogTitle=first(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||first(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
          const title=first(/<title[^>]*>([\s\S]*?)<\/title>/i);
          let name='';
          for(const raw of [heading,ogTitle,title]){
            if(!raw)continue;
            const n=raw.replace(/\s*[-–—]\s*(?:30th Celebration|[^-–—]+)?\s*\([^)]*\)\s*#?\d+.*$/i,'').trim();
            if(n){name=n;break;}
          }
          if(!name)continue;
          const image=first(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)||first(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          const canonical=first(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||url;
          const codeEsc=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
          const setMatch=html.match(new RegExp('>([^<>]{2,100})\\s*\\(\\s*'+codeEsc+'\\s*\\)\\s*#','i'));
          const setName=setMatch?strip(setMatch[1]):'';
          return res.status(200).json({name,localId:cleanNum,id:code+'-'+cleanNum,number:cleanNum,image,imageUrl:image,set:{id:code,name:setName},source:'Limitless',sourceUrl:canonical,cardmarketNameEnglish:name});
        }catch(e){}
      }
    }
    // 3) Cardmarket como último respaldo: busca por código+número y, si existe,
    // recupera la ficha individual exacta. Esto evita dejar al usuario en una búsqueda
    // genérica cuando TCGdex/Limitless todavía no tienen la carta nueva.
    if(code){
      const cm=await findCardmarketExact(code,cleanNum,uniqueLangs[0]||'en');
      if(cm?.name){
        return res.status(200).json({name:cm.name,localId:cleanNum,id:code+'-'+cleanNum,image:'',imageUrl:'',set:cm.set,cardmarketExactUrl:cm.cardmarketExactUrl,cardmarketNameEnglish:cm.cardmarketNameEnglish,source:cm.source,sourceUrl:cm.sourceUrl});
      }
    }
    return res.status(404).json({error:`No se encontró ${code?code+' ':''}${cleanNum} en las fuentes externas.`});
  }catch(e){return res.status(500).json({error:e?.message||'Error interno.'});}
};
