// TCGGO price lookup for PokeScan.
// Resolves the real TCGGO card page by expansion + collector number first.
// This is important because TCGGO uses the English card name in its URL
// (e.g. Dawn-118), while PokeScan may have the localized name (e.g. Maya).
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
  '151': '151',
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

function htmlText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&euro;/gi, '€')
    .replace(/&#8364;/gi, '€')
    .replace(/\s+/g, ' ');
}

function decodeHtml(v) {
  return String(v || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ');
}

function getLanguagePrice(html, language) {
  const label = LANG_LABELS[language];
  if (!label) return null;

  const text = htmlText(html);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // TCGGO renders:
  // Language | Region | Price
  // English | Europe | 4,50 €
  const re = new RegExp(
    '\\b' + escaped +
    '\\s*(?:\\|\\s*)?' + escaped +
    '\\s*(?:\\|\\s*)?Europe' +
    '\\s*(?:\\|\\s*)?(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*€',
    'i'
  );

  const m = text.match(re);
  if (m) {
    const n = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }

  // Fallback for slightly different HTML/text extraction.
  const pos = text.search(new RegExp('\\b' + escaped + '\\b', 'i'));
  if (pos >= 0) {
    const window = text.slice(pos, pos + 220);
    const amounts = [...window.matchAll(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/g)];
    if (amounts.length) {
      const n = Number(amounts[0][1].replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; PokeScan/1.0)',
      'accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'accept-language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });
  const html = await r.text();
  return { r, html, finalUrl: r.url || url };
}

// Finds the real TCGGO card URL from the expansion page using the
// collector code + number. This avoids depending on localized names.
function findCardUrlFromSet(html, baseUrl, code, number) {
  const wanted = String(code || '').trim().toUpperCase() + ' ' +
                 String(number || '').trim().replace(/^0+(?=\d)/, '');

  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let m;

  while ((m = re.exec(html))) {
    const href = decodeHtml(m[1]);
    let absolute = '';
    try { absolute = new URL(href, baseUrl).toString(); } catch (e) { continue; }

    if (!/^https:\/\/www\.tcggo\.com\/pokemon\//i.test(absolute)) continue;

    const txt = htmlText(m[2]);
    const combined = (txt + ' ' + absolute).replace(/\s+/g, ' ');
    const exactCodeNumber = new RegExp(
      '\\b' + String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*' + String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b',
      'i'
    );

    // The card links end in the card slug + "-number".
    let path = '';
    try { path = new URL(absolute).pathname; } catch (e) {}
    const endsWithNumber = new RegExp(
      '-' + String(number).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?$',
      'i'
    );

    if (exactCodeNumber.test(combined) && endsWithNumber.test(path)) {
      candidates.push(absolute);
    }
  }

  return [...new Set(candidates)];
}

export default async function handler(req, res) {
  try {
    const q = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const code = clean(q.code || q.setCode).toUpperCase();
    const number = clean(q.number || q.localId).split('/')[0].trim();
    const language = clean(q.lang || q.language || 'es').toLowerCase();
    const nameEnglish = clean(q.nameEnglish || q.cardmarketNameEnglish || '');
    const nameFallback = clean(q.name || '');

    if (!code || !number) {
      return res.status(400).json({ ok:false, error:'Faltan código o número de carta.' });
    }

    const languageKey = ({
      es:'es', español:'es', spanish:'es',
      en:'en', inglés:'en', english:'en',
      fr:'fr', francés:'fr', french:'fr',
      de:'de', alemán:'de', german:'de',
      it:'it', italiano:'it', italian:'it',
      ja:'ja', japonés:'ja', japanese:'ja',
      ko:'ko', coreano:'ko', korean:'ko',
      pt:'pt', portugués:'pt', portuguese:'pt',
      zh:'zh', chino:'zh', chinese:'zh'
    })[language] || language;

    if (!LANG_LABELS[languageKey]) {
      return res.status(400).json({
        ok:false,
        error:'TCGGO no tiene un idioma compatible para esta selección.'
      });
    }

    const setSlug = SET_SLUGS[code];
    if (!setSlug) {
      return res.status(404).json({
        ok:false,
        error:`TCGGO: expansión ${code} todavía no tiene ruta configurada.`
      });
    }

    const cleanNumber = number.replace(/^0+(?=\d)/, '');
    const setUrl = `https://www.tcggo.com/pokemon/${setSlug}`;

    // 1) Preferred method: expansion page -> exact code + number -> real card URL.
    let cardUrl = '';
    try {
      const setPage = await fetchHtml(setUrl);
      if (setPage.r.ok) {
        const found = findCardUrlFromSet(setPage.html, setPage.finalUrl, code, cleanNumber);
        if (found.length) cardUrl = found[0];
      }
    } catch (e) {}

    // 2) Fallback only when TCGGO's expansion index did not expose the card link.
    if (!cardUrl) {
      const candidateName = nameEnglish || nameFallback;
      if (candidateName) {
        cardUrl =
          `https://www.tcggo.com/pokemon/${setSlug}/` +
          `${slugify(candidateName)}-${encodeURIComponent(cleanNumber)}`;
      }
    }

    if (!cardUrl) {
      return res.status(404).json({
        ok:false,
        error:`TCGGO no encontró la carta ${code} ${cleanNumber}.`,
        url:setUrl
      });
    }

    const cardPage = await fetchHtml(cardUrl);
    if (!cardPage.r.ok) {
      return res.status(502).json({
        ok:false,
        error:`TCGGO respondió HTTP ${cardPage.r.status}.`,
        url:cardPage.finalUrl || cardUrl
      });
    }

    // Confirm that this really is the requested card.
    const identity = new RegExp(
      '\\b' + String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*' + String(cleanNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\b',
      'i'
    );

    if (!identity.test(htmlText(cardPage.html))) {
      return res.status(404).json({
        ok:false,
        error:`TCGGO no confirmó ${code} ${cleanNumber}.`,
        url:cardPage.finalUrl || cardUrl
      });
    }

    const price = getLanguagePrice(cardPage.html, languageKey);
    if (price == null) {
      return res.status(404).json({
        ok:false,
        error:`TCGGO no tiene precio para ${LANG_LABELS[languageKey]} en ${code} ${cleanNumber}.`,
        url:cardPage.finalUrl || cardUrl
      });
    }

    return res.status(200).json({
      ok:true,
      price,
      priceDisplay: price.toFixed(2).replace('.', ',') + ' €',
      source:'TCGGO',
      language:languageKey,
      url:cardPage.finalUrl || cardUrl
    });
  } catch (e) {
    return res.status(500).json({
      ok:false,
      error:e?.message || 'Error consultando TCGGO.'
    });
  }
}
