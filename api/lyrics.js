// api/lyrics.js — Letras desde LRCLIB (sincronizadas cuando existen) con
// lyrics.ovh de respaldo. Pasa por tu servidor para no depender de que esos
// sitios permitan peticiones desde el navegador, y la CDN de Vercel guarda
// cada resultado 7 días.

const UA = 'NeonPlay/3.0 (https://vercel.com)';

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Lrclib-Client': UA }, signal: AbortSignal.timeout(7000) });
  return r.ok ? r.json() : null;
}

module.exports = async (req, res) => {
  if (req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({ error: 'Origen no permitido' }); return; }
  const title = String(req.query.title || '').trim().slice(0, 150);
  const artist = String(req.query.artist || '').trim().slice(0, 150);
  const duration = Number(req.query.d) || 0;
  if (!title) { res.status(400).json({ error: 'Falta el título' }); return; }

  let result = { none: true };
  try {
    const q = new URLSearchParams({ track_name: title });
    if (artist) q.set('artist_name', artist);
    const arr = await getJson(`https://lrclib.net/api/search?${q}`);
    if (Array.isArray(arr) && arr.length) {
      const usable = arr.filter(x => !x.instrumental && (x.syncedLyrics || x.plainLyrics));
      const close = usable.filter(x => !duration || Math.abs((x.duration || 0) - duration) <= 4);
      const synced = close.find(x => x.syncedLyrics);
      // Si la duración no coincide (video con intro), la letra sincronizada
      // saldría desfasada: mejor la letra normal.
      const plain = close.find(x => x.plainLyrics) || usable.find(x => x.plainLyrics);
      if (synced) result = { lrc: synced.syncedLyrics, src: 'LRCLIB' };
      else if (plain) result = { text: plain.plainLyrics, src: 'LRCLIB' };
      else if (arr.some(x => x.instrumental)) result = { instrumental: true };
    }
  } catch (_) {}

  if (result.none && artist) {
    try {
      const d = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
      if (d?.lyrics?.trim()) result = { text: d.lyrics.trim(), src: 'lyrics.ovh' };
    } catch (_) {}
  }

  res.setHeader('Cache-Control', result.none ? 'public, s-maxage=3600' : 'public, s-maxage=604800, stale-while-revalidate=2592000');
  res.status(200).json(result);
};
