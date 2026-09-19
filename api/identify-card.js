const SET_DB = {"sets": {"PBL": "Pitch Black", "CRI": "Chaos Rising", "POR": "Perfect Order", "ASC": "Héroes Ascendentes", "PHF": "Phantasmal Flames", "PFL": "Llamas Fantasmales", "MEG": "Megaevolución", "MEP": "Megaevolución — Cartas Promo", "MEE": "Mega Evolution Energy", "BLK": "Black Bolt", "WHT": "White Flare", "DRI": "Destined Rivals", "JTG": "Journey Together", "PRE": "Prismatic Evolutions", "PAF": "Paldean Fates", "SSP": "Surging Sparks", "SCR": "Stellar Crown", "SFA": "Shrouded Fable", "TWM": "Twilight Masquerade", "TEF": "Temporal Forces", "PAR": "Paradox Rift", "MEW": "151", "OBF": "Obsidian Flames", "PAL": "Paldea Evolved", "SVI": "Scarlet & Violet", "CRZ": "Cenit Supremo", "SIT": "Silver Tempest", "LOR": "Lost Origin", "PGO": "Pokémon GO", "ASR": "Astral Radiance", "BRS": "Brilliant Stars", "FST": "Fusion Strike", "EVS": "Evolving Skies", "CRE": "Chilling Reign", "BST": "Battle Styles", "SHF": "Shining Fates", "VIV": "Vivid Voltage", "CPA": "Champion’s Path", "DAA": "Darkness Ablaze", "RCL": "Rebel Clash", "SSH": "Sword & Shield", "CEC": "Cosmic Eclipse", "HIF": "Hidden Fates", "UNB": "Unbroken Bonds", "UNM": "Unified Minds", "DET": "Detective Pikachu", "TEU": "Unión de Aliados", "LOT": "Lost Thunder", "DRM": "Dragon Majesty", "CES": "Celestial Storm", "FLI": "Forbidden Light", "UPR": "Ultra Prism", "CIN": "Crimson Invasion", "BUS": "Burning Shadows", "GRI": "Guardians Rising", "SUM": "Sun & Moon", "EVO": "Evolutions", "STS": "Steam Siege", "FCO": "Fates Collide", "GEN": "Generations", "BKT": "BREAKthrough", "BKP": "BREAKpoint", "AOR": "Ancient Origins", "ROS": "Roaring Skies", "PRC": "Primal Clash", "FLF": "Flashfire", "XY": "XY", "PLS": "Plasma Storm", "PLF": "Plasma Freeze", "PLB": "Plasma Blast", "BCR": "Boundaries Crossed", "DRV": "Dragon Vault", "DRX": "Dragons Exalted", "DEX": "Dark Explorers", "NXD": "Next Destinies", "NVI": "Noble Victories", "EPO": "Emerging Powers", "BLW": "Black & White", "LTR": "Legendary Treasures", "PL": "Platinum", "AR": "Arceus", "SV": "Supreme Victors", "RR": "Rising Rivals", "SF": "Stormfront", "LA": "Legends Awakened", "MD": "Majestic Dawn", "GE": "Great Encounters", "SW": "Secret Wonders", "DP": "Diamond & Pearl", "MT": "Mysterious Treasures", "POP": "POP Series", "HS": "HeartGold & SoulSilver", "UL": "HS—Unleashed", "UD": "HS—Undaunted", "TM": "HS—Triumphant", "CL": "Call of Legends", "HGSS": "HGSS Black Star Promos", "BS": "Base Set", "JU": "Jungle", "FO": "Fossil", "B2": "Base Set 2", "TR": "Team Rocket", "G1": "Gym Heroes", "G2": "Gym Challenge", "N1": "Neo Genesis", "N2": "Neo Discovery", "N3": "Neo Revelation", "N4": "Neo Destiny", "LC": "Legendary Collection", "EX": "Expedition Base Set", "AQ": "Aquapolis", "SK": "Skyridge", "RS": "Ruby & Sapphire", "SS": "Sandstorm", "DR": "Dragon", "MA": "Team Magma vs Team Aqua", "HL": "Hidden Legends", "RG": "FireRed & LeafGreen", "RRR": "Team Rocket Returns", "EM": "Emerald", "UF": "Unseen Forces", "DS": "Delta Species", "LM": "Legend Maker", "HP": "Holon Phantoms", "CG": "Crystal Guardians", "DF": "Dragon Frontiers", "PK": "Power Keepers", "SVP": "Escarlata y Púrpura — Cartas Promo"}, "aliases": {"PVL": "PFL", "MEP": "MEP", "ASC": "ASC", "CRZ": "CRZ", "MEW": "MEW"}}.sets;

const JP_SET_DB = {"SV1S": "Scarlet ex", "SV1V": "Violet ex", "SV1A": "Triplet Beat", "SV2P": "Snow Hazard", "SV2D": "Clay Burst", "SV2A": "Pokémon Card 151", "SV3": "Ruler of the Black Flame", "SV3A": "Raging Surf", "SV4M": "Future Flash", "SV4K": "Ancient Roar", "SV4A": "Shiny Treasure ex", "SV5K": "Wild Force", "SV5M": "Cyber Judge", "SV5A": "Crimson Haze", "SV6": "Mask of Change", "SV6A": "Night Wanderer", "SV7": "Stellar Miracle", "SV7A": "Paradise Dragona", "SV8": "Super Electric Breaker", "SV8A": "Terastal Festival ex", "SV9": "Battle Partners", "SV9A": "Heat Wave Arena", "SV10": "The Glory of Team Rocket", "SV11B": "Black Bolt", "SV11W": "White Flare", "M1L": "Mega Brave", "M1S": "Mega Symphonia", "M2": "Inferno X", "M2A": "Mega Dream ex", "M3": "Nihil Zero", "M4": "Ninja Spinner", "M5": "Abyss Eye", "M6": "Storm Emeralda", "S1W": "Shield", "S1H": "Sword", "S2": "Rebel Clash", "S3": "Infinity Zone", "S3A": "Legendary Heartbeat", "S4": "Amazing Volt Tackle", "S4A": "Shiny Star V", "S5I": "Ichigeki Master", "S5R": "Rapid Strike Master", "S6H": "Silver Lance", "S6K": "Jet Black Spirit", "S6A": "Matchless Fighter", "S7D": "Skyscraping Perfection", "S7R": "Blue Sky Stream", "S7A": "Eevee Heroes", "S8": "Fusion Arts", "S8A": "25th Anniversary Collection", "S8B": "VMAX Climax", "S9": "Star Birth", "S9A": "Battle Region", "S10D": "Time Gazer", "S10P": "Space Juggler", "S10A": "Dark Phantasma", "S11": "Lost Abyss", "S11A": "Incandescent Arcana", "S12": "Paradigm Trigger", "S12A": "VSTAR Universe", "SM1S": "Collection Sun", "SM1M": "Collection Moon", "SM2L": "Alolan Moonlight", "SM2K": "Alolan Kokoro", "SM3H": "Hibana", "SM3N": "A Clash of the Sky and Sea", "SM4S": "Awakened Heroes", "SM4A": "Crack Shot", "SM5S": "Ultra Sun", "SM5M": "Ultra Moon", "SM6S": "Forbidden Light", "SM6B": "Forbidden Light", "SM7": "Thunderclap Spark", "SM8": "Super Burst Impact", "SM8B": "Dark Order", "SM9": "Tag Bolt", "SM9A": "Night Unison", "SM10": "Double Blaze", "SM10A": "GG End", "SM11": "Miracle Twin", "SM11B": "Dream League", "SM12": "Alter Genesis", "SM12A": "Tag All Stars", "XY1": "Collection X / Collection Y", "XY2": "Wild Blaze", "XY3": "Rising Fist", "XY4": "Phantom Gate", "XY5": "Gaia Volcano / Tidal Storm", "XY6": "Emerald Break", "XY7": "Bandit Ring", "XY8": "Red Flash / Blue Impact", "XY9": "Rage of the Broken Sky", "XY10": "The Best of XY", "XY11": "Cruel Traitor / Explosive Fighter", "XY12": "20th Anniversary Festa", "BW1": "Black Collection / White Collection", "BW2": "Red Collection", "BW3": "Psycho Drive / Hail Blizzard", "BW4": "Dark Rush", "BW5": "Dragon Blade / Dragon Blast", "BW6": "Freeze Bolt / Cold Flare", "BW7": "Plasma Gale", "BW8": "Spiral Force / Thunder Knuckle", "BW9": "Megalo Cannon", "BW10": "EX Battle Boost", "MP1": "Start Deck 100 Battle Collection", "M-P": "Promotional Cards", "SV-P": "Scarlet & Violet Promos", "M-PRO": "Mega Evolution Promotional Cards"};
function normalizeJpCode(raw) {
  return String(raw||'').trim().toUpperCase().replace(/[\s_-]+/g,'');
}
function getJapaneseExpansion(code) {
  const c=normalizeJpCode(code);
  return JP_SET_DB[c] || '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'Falta GEMINI_API_KEY en Vercel.' });
  try {
    const { image, codeImage = '', currentKind = 'card' } = req.body || {};
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Falta la imagen.' });
    const full = image.match(/^data:([^;]+);base64,(.+)$/);
    if (!full) return res.status(400).json({ error: 'Formato de imagen no válido.' });
    const isCard = currentKind === 'card' || currentKind === 'graded';
    const code = codeImage.match(/^data:([^;]+);base64,(.+)$/);
    const prompt = isCard ? `Identifica esta carta Pokémon y devuelve SOLO JSON válido.

REGLAS ESTRICTAS DE CÓDIGO Y EXPANSIÓN:
1) IMAGEN 1: identifica el nombre de la carta Y detecta el idioma visible de la carta leyendo el texto impreso. Devuelve language_code usando SOLO uno de: ES, EN, JA, FR, DE, IT, PT, KO. Si no puedes determinarlo con seguridad, deja language_code vacío.
2) IMAGEN 2: recorte ampliado de la esquina inferior izquierda. Lee SOLO el código principal grande de colección y el número de coleccionista.
3) IMPORTANTE: el idioma visible de la carta y el código de expansión son datos independientes. No uses el código para inventar el idioma y no uses el idioma para cambiar el código.
4) En códigos como "MEP ES 097", "30C ES 002" o "PFL ES 100", IGNORA las letras pequeñas de idioma (ES, EN, JP, etc.) que acompañen al código. El código principal debe ser únicamente MEP, 30C, PFL, etc.
5) No unas el código principal con las letras pequeñas del idioma. Por ejemplo, "MEP ES 097" debe devolver set_code="MEP" y number="097".
6) Para códigos japoneses de expansiones, conserva literalmente el código principal (por ejemplo SV8A, SV9A, SV1S, M2A, M3) y normalízalo a mayúsculas.
7) MUY IMPORTANTE: "SVP 195" y "195/SV-P" son códigos diferentes. "SVP 195" es una promo occidental; "195/SV-P" es una promo japonesa. Si la carta japonesa muestra "PROMO 195/SV-P", devuelve set_code="SV-P" y language_code="JA". NO conviertas SV-P en SVP.
8) Si el código principal es nuevo/desconocido, devuélvelo igualmente. El servidor intentará descubrir la expansión mediante fuentes externas.
9) Si el código principal realmente no se puede leer con seguridad, déjalo vacío.
10) expansion DEBE ser vacío. PokeScan decide el nombre internamente según código + idioma detectado.
11) number debe ser solo el número de coleccionista, sin /total.
12) language debe ser el nombre del idioma detectado cuando language_code sea válido.

CATÁLOGO JAPONÉS INTERNO (usar SOLO cuando language_code=JA):
SV1S: Scarlet ex; SV1V: Violet ex; SV1A: Triplet Beat; SV2P: Snow Hazard; SV2D: Clay Burst; SV2A: Pokémon Card 151; SV3: Ruler of the Black Flame; SV3A: Raging Surf; SV4M: Future Flash; SV4K: Ancient Roar; SV4A: Shiny Treasure ex; SV5K: Wild Force; SV5M: Cyber Judge; SV5A: Crimson Haze; SV6: Mask of Change; SV6A: Night Wanderer; SV7: Stellar Miracle; SV7A: Paradise Dragona; SV8: Super Electric Breaker; SV8A: Terastal Festival ex; SV9: Battle Partners; SV9A: Heat Wave Arena; SV10: The Glory of Team Rocket; SV11B: Black Bolt; SV11W: White Flare; M1L: Mega Brave; M1S: Mega Symphonia; M2: Inferno X; M2A: Mega Dream ex; M3: Nihil Zero; M4: Ninja Spinner; M5: Abyss Eye; M6: Storm Emeralda; S1W: Shield; S1H: Sword; S2: Rebel Clash; S3: Infinity Zone; S3A: Legendary Heartbeat; S4: Amazing Volt Tackle; S4A: Shiny Star V; S5I: Ichigeki Master; S5R: Rapid Strike Master; S6H: Silver Lance; S6K: Jet Black Spirit; S6A: Matchless Fighter; S7D: Skyscraping Perfection; S7R: Blue Sky Stream; S7A: Eevee Heroes; S8: Fusion Arts; S8A: 25th Anniversary Collection; S8B: VMAX Climax; S9: Star Birth; S9A: Battle Region; S10D: Time Gazer; S10P: Space Juggler; S10A: Dark Phantasma; S11: Lost Abyss; S11A: Incandescent Arcana; S12: Paradigm Trigger; S12A: VSTAR Universe; SM1S: Collection Sun; SM1M: Collection Moon; SM2L: Alolan Moonlight; SM2K: Alolan Kokoro; SM3H: Hibana; SM3N: A Clash of the Sky and Sea; SM4S: Awakened Heroes; SM4A: Crack Shot; SM5S: Ultra Sun; SM5M: Ultra Moon; SM6S: Forbidden Light; SM6B: Forbidden Light; SM7: Thunderclap Spark; SM8: Super Burst Impact; SM8B: Dark Order; SM9: Tag Bolt; SM9A: Night Unison; SM10: Double Blaze; SM10A: GG End; SM11: Miracle Twin; SM11B: Dream League; SM12: Alter Genesis; SM12A: Tag All Stars; XY1: Collection X / Collection Y; XY2: Wild Blaze; XY3: Rising Fist; XY4: Phantom Gate; XY5: Gaia Volcano / Tidal Storm; XY6: Emerald Break; XY7: Bandit Ring; XY8: Red Flash / Blue Impact; XY9: Rage of the Broken Sky; XY10: The Best of XY; XY11: Cruel Traitor / Explosive Fighter; XY12: 20th Anniversary Festa; BW1: Black Collection / White Collection; BW2: Red Collection; BW3: Psycho Drive / Hail Blizzard; BW4: Dark Rush; BW5: Dragon Blade / Dragon Blast; BW6: Freeze Bolt / Cold Flare; BW7: Plasma Gale; BW8: Spiral Force / Thunder Knuckle; BW9: Megalo Cannon; BW10: EX Battle Boost; MP1: Start Deck 100 Battle Collection; M-P: Promotional Cards; SVP: Scarlet & Violet Black Star Promos; M-PRO: Mega Evolution Promotional Cards

CATÁLOGO OCCIDENTAL: usa la base occidental interna de PokeScan; no la mezcles con la japonesa.

Campos: name, set_code, collector_number, number, expansion, language, language_code, variant, confidence (0 a 1).` : `Identifica este producto Pokémon sellado o producto graduado. Devuelve SOLO JSON válido. Lee literalmente nombre, expansión/código, número si aparece y variante. Si el producto muestra un símbolo de set, identifícalo. No inventes datos. Campos: name, set_code, collector_number, number, expansion, language, language_code, variant, confidence (0 a 1).`;
    const models = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'];
    let lastError = null;
    for (const model of models) {
      const parts = [{ text: prompt }, { text: 'IMAGEN 1 = CARTA COMPLETA. Úsala solo para nombre e idioma.' }, { inline_data: { mime_type: full[1], data: full[2] } }];
      if (isCard && code) parts.push({ text: 'IMAGEN 2 = RECORTE AMPLIADO DE LA ESQUINA INFERIOR IZQUIERDA. Úsala solo para código de expansión y número.' }, { inline_data: { mime_type: code[1], data: code[2] } });
      const body = { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':key}, body:JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { lastError=j?.error||{message:'Error de Gemini'}; if (j?.error?.code===429 || j?.error?.code===503 || j?.error?.status==='UNAVAILABLE') continue; return res.status(502).json({error:`Gemini API error: ${j?.error?.message||'Error desconocido'}`}); }
      const text=j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
      let parsed=null; try{parsed=JSON.parse(text)}catch{try{parsed=JSON.parse(text.replace(/^```json\s*/i,'').replace(/```$/i,'').trim())}catch{}}
      if(!parsed){lastError={message:'Gemini no devolvió JSON válido.'};continue;}
      const number=String(parsed.collector_number||parsed.number||'').trim().replace(/^#/,'').split('/')[0];
      let setCode=String(parsed.set_code||parsed.expansion_code||parsed.code||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');
      // Gemini detecta el idioma por el texto visible de la carta.
      // Ese idioma decide qué catálogo de expansiones utilizar: occidental o japonés.
      let langCode=String(parsed.language_code||parsed.languageCode||'').trim().toUpperCase();
      if(!['ES','EN','JA','FR','DE','IT','PT','KO'].includes(langCode)) langCode='';
      const isJapanese=langCode==='JA';
      const directAliases={"PVL":"PFL"};
      // SV-P es exclusivamente japonés y debe conservar el guion para no confundirlo con SVP occidental.
      if(isJapanese && /^SVP$/.test(setCode)) setCode='SV-P';
      if(!isJapanese && setCode==='SV-P') setCode='SVP';
      if(!isJapanese && directAliases[setCode]) setCode=directAliases[setCode];
      const expansion=isJapanese ? (JP_SET_DB[setCode]||'') : (SET_DB[setCode]||'');
      // Si el catálogo interno no conoce el código, lo dejamos intacto para que
      // el motor externo pueda descubrirlo después.
      parsed.language_code=langCode;
      parsed.language=({ES:'Español',EN:'Inglés',JA:'Japonés',FR:'Francés',DE:'Alemán',IT:'Italiano',PT:'Portugués',KO:'Coreano'}[langCode]||'');
      parsed.collector_number=number; parsed.number=number; parsed.set_code=setCode; parsed.expansion=expansion; parsed.kind=currentKind;
      parsed.cardmarket_language_id=({ES:4,EN:1,FR:2,DE:3,IT:5,JA:7,PT:8,KO:10}[String(parsed.language_code||'').toUpperCase()]||null);
      parsed.marketUrl=buildCardmarketUrl(currentKind,String(parsed.name||'').trim(),setCode,number,parsed.variant,parsed.expansion);
      return res.status(200).json(parsed);
    }
    return res.status(502).json({error:`Gemini no está disponible ahora mismo. ${lastError?.message||''}`.trim()});
  } catch(e){return res.status(500).json({error:e?.message||'Error interno.'});}
};
function buildCardmarketUrl(kind,name,setCode,number,variant,expansion){
  const query=kind==='card'||kind==='graded'?[name,setCode,number,variant].filter(Boolean).join(' '):[name,expansion,variant].filter(Boolean).join(' ');
  if(!query)return '';
  const base=kind==='sealed'?'https://www.cardmarket.com/es/Pokemon/Products/Sealed-Products':'https://www.cardmarket.com/es/Pokemon/Products/Singles';
  return `${base}?searchString=${encodeURIComponent(query)}`;
}
