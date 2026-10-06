// TCGGO price lookup for PokeScan.
// Reads the language-specific Cardmarket price shown by TCGGO.
// No paid API is used: the public card page is fetched server-side.
const SET_SLUGS = {
  PFL: 'phantasmal-flames',
  MEP: 'mega-evolution',
  ASC: 'ascended-heroes',
  CRI: 'chaos-rising',
  WHF: 'white-flare',
  BLK: 'black-bolt',
  PRE: 'prismatic-evolutions',
  SSP: 'surging-sparks',
  SCR: 'stellar-crown',
  SFA: 'shrouded-fable',
  TWM: 'twilight-masquerade',
  TEF: 'temporal-forces',
  PAF: 'paldean-fates',
  PAR: 'paradox-rift',
  OBF: 'obsidian-flames',
  PAL: 'paldea-evolved',
  SVI: 'scarlet-violet',
  151: '151',
  MEG: 'mega-evolution'
};

const LANG_LABELS = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  zh: 'Chinese'
};

function clean(v) {
  return String(v || '').replace(/\s+/g, ' ').trim();
}
function slugify(v) {
  return clean(v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function priceNumber(v) {
  const m = clean(v).match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function htmlText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&euro;/gi, '€')
    .replace(/&#8364;/gi, '€')
    .replace(/\s+/g, ' ');
}
function getLanguagePrice(html, language) {
  const label = LANG_LABELS[language];
  if (!label) return null;
  const text = htmlText(html);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // TCGGO's table is rendered as: Language | Region | Price.
  // In the parsed text it can appear either with pipes or only whitespace.
  const re = new RegExp(
    escaped + '\\s*(?:\\|\\s*)?' + escaped + '\\s*(?:\\|\\s*)?Europe\\s*(?:\\|\\s*)?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€',
    'i'
  );
  const m = text.match(re);
  if (m) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }

  // More permissive fallback: only inspect a short window after the language
  // row and take the first euro amount in that row.
  const pos = text.search(new RegExp('\\b' + escaped + '\\b', 'i'));
  if (pos >= 0) {
    const window = text.slice(pos, pos + 180);
    const amounts = [...window.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g)];
    if (amounts.length) {
      const n = Number(amounts[0][1].replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    const q = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const code = clean(q.code || q.setCode).toUpperCase();
    const number = clean(q.number || q.localId).split('/')[0].trim();
    const language = clean(q.lang || q.language || 'es').toLowerCase();
    const nameEnglish = clean(q.nameEnglish || q.cardmarketNameEnglish || q.name);

    if (!code || !number) {
      return res.status(400).json({ ok:false, error:'Faltan código o número de carta.' });
    }
    const languageKey = ({es:'es', español:'es', spanish:'es', en:'en', inglés:'en', english:'en',
      fr:'fr', francés:'fr', french:'fr', de:'de', alemán:'de', german:'de',
      it:'it', italiano:'it', italian:'it', ja:'ja', japonés:'ja', japanese:'ja',
      ko:'ko', coreano:'ko', korean:'ko', pt:'pt', portugués:'pt', portuguese:'pt',
      zh:'zh', chino:'zh', chinese:'zh'})[language] || language;
    if (!LANG_LABELS[languageKey]) {
      return res.status(400).json({ok:false,error:'TCGGO no tiene un idioma compatible para esta selección.'});
    }

    const setSlug = SET_SLUGS[code];
    if (!setSlug) {
      return res.status(404).json({ok:false,error:`TCGGO: expansión ${code} todavía no tiene ruta configurada.`});
    }

    const slugName = slugify(nameEnglish);
    if (!slugName) {
      return res.status(400).json({ok:false,error:'No hay nombre de carta para localizarla en TCGGO.'});
    }

    const cleanNumber = number.replace(/^0+(?=\d)/,'');
    const url = `https://www.tcggo.com/pokemon/${setSlug}/${slugName}-${encodeURIComponent(cleanNumber)}`;
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PokeScan/1.0)',
        'accept': 'text/html,application/xhtml+xml'
      }
    });
    const html = await r.text();
    if (!r.ok) {
      return res.status(502).json({ok:false,error:`TCGGO respondió HTTP ${r.status}.`,url});
    }

    // Exact card identity check prevents a wrong slug from silently returning another card.
    const identity = htmlText(html).match(new RegExp(`\\bPFL\\s*${cleanNumber}\\b`, 'i'));
    if (code === 'PFL' && !identity) {
      return res.status(404).json({ok:false,error:`TCGGO no confirmó ${code} ${cleanNumber}.`,url});
    }

    const price = getLanguagePrice(html, languageKey);
    if (price == null) {
      return res.status(404).json({
        ok:false,
        error:`TCGGO no tiene precio para ${LANG_LABELS[languageKey]} en ${code} ${cleanNumber}.`,
        url
      });
    }

    return res.status(200).json({
      ok:true,
      price,
      priceDisplay: price.toFixed(2).replace('.',',') + ' €',
      source:'TCGGO',
      language:languageKey,
      url
    });
  } catch (e) {
    return res.status(500).json({ok:false,error:e?.message||'Error consultando TCGGO.'});
  }
}
