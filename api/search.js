// api/search.js — Búsqueda en YouTube desde el servidor.
//
// La API key ya NO vive en el HTML (antes cualquiera podía copiarla y gastarte
// la cuota). Configúrala en Vercel → Settings → Environment Variables:
//   YT_API_KEY = tu clave de YouTube Data API v3
//   YT_REGION  = MX (opcional)
//
// Cada búsqueda cuesta 100 unidades de cuota (10,000 al día ≈ 100 búsquedas).
// Por eso las respuestas se guardan 24 h en la CDN de Vercel: si tú u otra
// persona repite la misma búsqueda, no se gasta cuota.

const KEY = process.env.YT_API_KEY;
const REGION = process.env.YT_REGION || 'MX';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Quita el "ruido" típico de los títulos de YouTube para que se vean como en
// una app de música: (Official Video), [Letra], | Canal, #hashtags…
const NOISE = /\s*[(\[【][^)\]】]*\b(official|oficial|video|v[ií]deo|videoclip|audio|lyrics?|letra|visuali[sz]er|hd|hq|4k|mv|m\/v)\b[^)\]】]*[)\]】]/gi;

function cleanMeta(rawTitle, rawChannel) {
  const original = decode(rawTitle).trim();
  let title = original
    .replace(NOISE, '')
    .replace(/\s+#\S+/g, '')
    .replace(/\s*[|｜].*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let artist = decode(rawChannel)
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s+(official|oficial)$/i, '')
    .trim();

  const dash = title.match(/^(.{1,60}?)\s+[-–—]\s+(.+)$/);
  const quoted = title.match(/^(.{1,40}?)\s*["“](.+?)["”]\s*$/);
  if (dash) { artist = dash[1].trim(); title = dash[2].trim(); }
  else if (quoted) { artist = quoted[1].trim(); title = quoted[2].trim(); }
  title = title.replace(/^["“'](.+)["”']$/, '$1').trim();

  return { title: title || original, artist: artist || 'YouTube' };
}

function isoToSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

async function yt(endpoint, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  Object.entries({ ...params, key: KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = data?.error?.errors?.[0]?.reason || '';
    const e = new Error(data?.error?.message || `YouTube API ${r.status}`);
    e.status = reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' ? 429 : 502;
    throw e;
  }
  return data;
}

module.exports = async (req, res) => {
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }
  if (!KEY) {
    res.status(500).json({ error: 'Falta configurar YT_API_KEY en Vercel.' });
    return;
  }
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (!q) {
    res.status(400).json({ error: 'Escribe algo para buscar.' });
    return;
  }

  try {
    const base = { part: 'snippet', type: 'video', maxResults: '25', q, regionCode: REGION, safeSearch: 'none' };
    // Primero solo la categoría Música (10); si no hay nada, búsqueda general.
    let found = await yt('search', { ...base, videoCategoryId: '10' });
    if (!found.items?.length) found = await yt('search', base);

    const items = (found.items || []).filter(i => i.id?.videoId && i.snippet?.liveBroadcastContent === 'none');
    const ids = items.map(i => i.id.videoId);
    const durations = {};
    if (ids.length) {
      const details = await yt('videos', { part: 'contentDetails', id: ids.join(',') });
      (details.items || []).forEach(v => { durations[v.id] = isoToSeconds(v.contentDetails?.duration); });
    }

    const tracks = items
      .filter(i => durations[i.id.videoId] > 0)
      .map(i => ({
        id: i.id.videoId,
        ...cleanMeta(i.snippet.title, i.snippet.channelTitle),
        duration: durations[i.id.videoId],
      }));

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ tracks });
  } catch (e) {
    const status = e.status || 502;
    const error = status === 429
      ? 'Se agotaron las búsquedas de hoy (límite de YouTube). Se reinicia a medianoche, hora del Pacífico. Tus playlists siguen funcionando.'
      : 'No se pudo buscar en este momento. Intenta de nuevo.';
    console.error('[search]', e.message);
    res.status(status).json({ error });
  }
};

module.exports.cleanMeta = cleanMeta;
