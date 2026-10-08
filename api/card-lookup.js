

async function findLimitlessEnglishName(code, number) {
  const c=String(code||'').trim().toUpperCase();
  const n=String(number||'').split('/')[0].trim().replace(/^0+/,'') || String(number||'').trim();
  if(!c||!n) return '';
  const variants=[...new Set([c,c.toLowerCase(),/^[A-Z]{1,4}\d+[A-Z]$/.test(c)?c.slice(0,-1)+c.slice(-1).toLowerCase():c])];
  const extract=html=>{
    const vals=[];
    const push=v=>{v=String(v||'').replace(/<[^>]+>/g,' ').replace(/&amp;/gi,'&').replace(/&#39;|&#x27;|&#039;/gi,"'").replace(/&quot;|&#x22;/gi,'"').replace(/\s+/g,' ').trim();if(v&&!vals.includes(v))vals.push(v)};
    for(const re of [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]){const m=html.match(re);if(m?.[1])push(m[1]);}
    for(let v of vals){
      v=v.replace(/\s*[–—]\s*Limitless.*$/i,'').replace(/\s*\|\s*Limitless.*$/i,'').trim();
      const m=v.match(/^(.+?)\s+[-–—]\s+.+?\s*\([A-Za-z0-9-]+\)\s*#?\d+/);
      if(m?.[1])v=m[1].trim();
      if(v&&!/[\u3040-\u30ff\u3400-\u9fff]/.test(v)&&/[A-Za-z]/.test(v))return v;
    }
    return '';
  };
  for(const v of variants){
    const base=`https://limitlesstcg.com/cards/jp/${encodeURIComponent(v)}/${encodeURIComponent(n)}`;
    for(const url of [`${base}?translate=en`,`${base}?lang=en.t`,`${base}?translate=en&lang=en.t`,base]){
      try{
        const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; PokeScan/1.0)','Accept':'text/html,application/xhtml+xml'},cache:'no-store'});
        if(!r.ok)continue;
        const html=await r.text();
        const name=extract(html);
        if(name)return name;
      }catch(e){}
    }
  }
  return '';
}

function decodeHtmlEntities(s){
  return String(s||'')
    .replace(/&amp;/gi,'&').replace(/&#39;|&#x27;|&#039;/gi,"'")
    .replace(/&quot;|&#x22;|&#034;/gi,'\"')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}
function cardmarketSearchName(s){
  let v=decodeHtmlEntities(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  // For Japanese trainer-Pokémon cards Cardmarket search works reliably with
  // the Pokémon name plus collector number, without the trainer prefix.
  v=v.replace(/^[^\s]+(?:['’]s)\s+/i,'');
  return v.trim();
}

async function findCardmarketExact(code, number, preferredLang='en', englishName='') {
  const cleanCode=String(code||'').trim().toUpperCase();
  const rawNum=String(number||'').split('/')[0].trim();
  const cleanNum=rawNum.replace(/^0+/,'') || rawNum;
  const numCandidates=[...new Set([rawNum,cleanNum,cleanNum.padStart(3,'0')].filter(Boolean))];
  if(!cleanCode || !rawNum) return null;
  // Cardmarket indexa muchas japonesas con el número de tres cifras y separado del código.
  // Probamos primero ese formato para no caer en una búsqueda vacía.
  const padded=cleanNum.replace(/^0+/,'').padStart(3,'0');
  const enName=String(englishName||'').trim();
  const basicName=cardmarketSearchName(enName);
  // Cardmarket puede catalogar las japonesas con el nombre inglés completo,
  // pero para cartas de Pokémon con entrenador (Cynthia's Roserade, Cynthia's
  // Garchomp ex, Ethan's Ho-Oh ex, etc.) la búsqueda más estable es el nombre
  // básico del Pokémon + código + número.
  const nameVariants=[...new Set([basicName,enName].filter(Boolean))];
  const nameQueries=[];
  for(const nm of nameVariants){
    nameQueries.push(nm+' '+padded,nm+' '+cleanNum,nm+' '+cleanCode+' '+padded,nm+' '+cleanCode+' '+cleanNum);
  }
  const queries=[...new Set([...nameQueries, cleanCode+' '+padded, cleanCode+' '+rawNum, cleanCode+padded, cleanCode+rawNum, ...numCandidates.map(n=>cleanCode+' '+n)])];
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
        const nameQueryUsed=(basicName && q.toLowerCase().includes(basicName.toLowerCase())) || (enName && q.toLowerCase().includes(enName.toLowerCase()));
        // En consultas por nombre, Cardmarket puede devolver la ficha con un
        // sufijo V1/V2 que no coincide literalmente con el marcador compacto.
        // El propio resultado de la búsqueda ya viene filtrado por nombre; aun así
        // exigimos que la URL contenga el código/número cuando esté disponible.
        if(!matchedMarker && !nameQueryUsed) continue;
        if(!matchedMarker && nameQueryUsed && !new RegExp(cleanCode+'[^a-z0-9]*'+padded, 'i').test(tail)) continue;
        const parts=path.split('/').filter(Boolean);
        const setSlug=parts.length>=2?parts[parts.length-2]:'';
        const marker=matchedMarker || ((new RegExp(cleanCode.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[-_]?'+padded+'$','i').test(tail)) ? (cleanCode+padded) : '');
        const markerRe=marker ? new RegExp('[-_]?'+marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i') : null;
        let cardSlug=markerRe ? tail.replace(markerRe,'').replace(/[-_]+$/,'') : tail.replace(/[-_]+$/,'');
        let name=decodeURIComponent(cardSlug).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
        if(name) name=name.replace(/\bEx\b/g,'ex');
        const setName=decodeURIComponent(setSlug).replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
        const langId=({es:4,en:1,fr:2,de:3,it:5,pt:8,ja:7,ko:10}[String(preferredLang||'en').toLowerCase()]||1);
        // Cardmarket's product-page filter uses `language` in the web URL.
        // For Japanese listings it MUST be 7; never inherit the default English (1)
        // from a previously generated/external URL.
        let exact=absolute;
        try{
          const eu=new URL(absolute);
          eu.searchParams.set('language', langId);
          eu.searchParams.delete('idLanguage');
          exact=eu.toString();
        }catch(e){
          exact=absolute+(absolute.includes('?')?'&':'?')+'language='+langId;
        }
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
    const decode=s=>String(s||'').replace(/&amp;/gi,'&').replace(/&#39;|&#x27;|&#039;/gi,"'").replace(/&quot;|&#x22;/gi,'"').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
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
              let englishSetName='';
              // La plantilla sigue usando el idioma solicitado (normalmente español),
              // pero guardamos POR DETRÁS la misma carta y expansión en inglés.
              // Esto evita mantener una tabla manual de traducciones y sirve también
              // para expansiones futuras que TCGdex vaya añadiendo.
              try{
                const enUrl=`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(discoveredSetId+'-'+cleanNum)}`;
                const er=await fetch(enUrl,{headers:{Accept:'application/json'},cache:'no-store'});
                if(er.ok){
                  const ec=await er.json();
                  if(ec&&String(ec.name||'').trim()) englishName=String(ec.name).trim();
                  if(ec?.set?.name) englishSetName=String(ec.set.name).trim();
                }
              }catch(e){}
              if(!englishSetName){
                try{
                  const esu=await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(discoveredSetId)}`,{headers:{Accept:'application/json'},cache:'no-store'});
                  if(esu.ok){const esj=await esu.json(); if(esj?.name) englishSetName=String(esj.name).trim();}
                }catch(e){}
              }
              const cardmarketProductId=String(card?.pricing?.cardmarket?.idProduct||card?.thirdParty?.cardmarket||'').trim();
              // Para cartas japonesas, TCGdex puede devolver la carta correctamente pero
              // su idProduct de Cardmarket puede apuntar a otra impresión/idioma. Buscamos
              // además la ficha individual por código+número y guardamos ese enlace exacto.
              let cardmarketExactUrl='';
              const isJapanese=String(lang).toLowerCase()==='ja' || /^SV-P$/.test(code) || /^[A-Z]{1,4}\d+[A-Z]$/.test(code);
              if(isJapanese){
                // TCGdex puede devolver correctamente la carta japonesa pero no su
                // nombre inglés. Cardmarket sí indexa la ficha por el nombre inglés,
                // así que recuperamos ese nombre como respaldo antes de consultar CM.
                if(!englishName || /[\u3040-\u30ff\u3400-\u9fff]/.test(englishName)) {
                  const limitName=await findLimitlessEnglishName(code,cleanNum);
                  if(limitName) englishName=limitName;
                }
                const cm=await findCardmarketExact(code,cleanNum,'ja',englishName);
                if(cm?.cardmarketExactUrl) cardmarketExactUrl=cm.cardmarketExactUrl;
              }
              return res.status(200).json({...card,image,imageUrl:imageUrl||image,cardmarketProductId,cardmarketExactUrl,cardmarketNameEnglish:englishName,nameEnglish:englishName,tcggoSetEnglish:englishSetName,source:'TCGdex',sourceUrl:url});
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
      const cm=await findCardmarketExact(code,cleanNum,uniqueLangs[0]||'en',String(body.englishName||body.cardmarketNameEnglish||'').trim());
      if(cm?.name){
        return res.status(200).json({name:cm.name,localId:cleanNum,id:code+'-'+cleanNum,image:'',imageUrl:'',set:cm.set,cardmarketExactUrl:cm.cardmarketExactUrl,cardmarketNameEnglish:cm.cardmarketNameEnglish,cardmarketSearchName:cardmarketSearchName(cm.cardmarketNameEnglish),source:cm.source,sourceUrl:cm.sourceUrl});
      }
    }
    return res.status(404).json({error:`No se encontró ${code?code+' ':''}${cleanNum} en las fuentes externas.`});
  }catch(e){return res.status(500).json({error:e?.message||'Error interno.'});}
};
