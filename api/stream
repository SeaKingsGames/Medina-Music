// api/stream.js — Vercel Node.js Serverless Function (Node, no Edge: ytdl-core
// necesita APIs de Node).
//
// Proxy de audio de YouTube con @distube/ytdl-core. Mejoras frente a v2:
//  • Cache en memoria de la URL firmada por instancia: ya no se llama a
//    getInfo() en cada seek / cada petición Range (antes eran 2–3 llamadas
//    por canción y cada una tardaba 1–3 s).
//  • Respuestas por bloques (Range de 2 MB). Cada petición termina rápido,
//    así la función nunca choca con el límite de tiempo de Vercel a media
//    canción (esa era la causa de cortes que disparaban el fallback con ads).
//  • Si la URL firmada caducó (403/410) se vuelve a resolver sola.
//  • ?warm=1 precalienta la siguiente canción de la cola.
//  • Solo acepta peticiones desde tu propia app (Sec-Fetch-Site), para que
//    nadie más use tu proxy y te consuma el ancho de banda.

const { Readable } = require('stream');
const ytdl = require('@distube/ytdl-core');

const CHUNK = 2 * 1024 * 1024;     // 2 MB por petición ≈ 2 min de audio a 128 kbps
const MAX_CACHE = 300;
const cache = new Map();           // `${id}|${q}|${opus}` -> { url, mime, size, expires }

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// Elige el formato según la calidad pedida.
//  low    → el más ligero (ideal con datos móviles)
//  normal → AAC ~128 kbps: suena en TODOS los navegadores, incluido iPhone
//  high   → Opus ~160 kbps si el navegador lo soporta; si no, AAC
function pickFormat(formats, quality, opusOk) {
  const byRate = (a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0);
  const aac = formats.filter(f => /mp4/.test(f.mimeType || '')).sort(byRate);
  const opus = opusOk ? formats.filter(f => /webm/.test(f.mimeType || '')).sort(byRate) : [];

  if (quality === 'high') return opus[0] || aac[0] || formats[0];
  if (quality === 'low') return opus[opus.length - 1] || aac[aac.length - 1] || formats[0];
  return aac.find(f => (f.audioBitrate || 0) <= 130) || aac[0] || opus[0] || formats[0];
}

async function resolve(videoId, quality, opusOk, force) {
  const key = `${videoId}|${quality}|${opusOk ? 1 : 0}`;
  const hit = cache.get(key);
  if (!force && hit && hit.expires > Date.now()) return hit;

  let info;
  try {
    info = await ytdl.getInfo(videoId);
  } catch (e) {
    const msg = String(e && e.message || '');
    if (/sign in|bot/i.test(msg)) throw httpError(503, 'YouTube está limitando al servidor. Intenta en unos minutos.');
    if (/age|inappropriate/i.test(msg)) throw httpError(403, 'Este video tiene restricción de edad.');
    if (/unavailable|private|removed|not available/i.test(msg)) throw httpError(404, 'Este video no está disponible.');
    throw httpError(502, 'No se pudo leer el video de YouTube.');
  }

  const formats = ytdl
    .filterFormats(info.formats, 'audioonly')
    .filter(f => f.url && (!f.audioTrack || f.audioTrack.audioIsDefault));
  if (!formats.length) throw httpError(404, 'Este video no tiene audio disponible.');

  const f = pickFormat(formats, quality, opusOk);
  const expireParam = Number(new URL(f.url).searchParams.get('expire'));
  const urlExpiry = expireParam ? expireParam * 1000 - 5 * 60 * 1000 : Infinity;

  const entry = {
    url: f.url,
    mime: (f.mimeType || 'audio/mp4').split(';')[0],
    size: Number(f.contentLength) || 0,
    expires: Math.min(Date.now() + 60 * 60 * 1000, urlExpiry),
  };
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return entry;
}

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m) return { start: 0, end: null };
  if (m[1] === '' && m[2] !== '') {            // "bytes=-500" → últimos 500 bytes
    if (!size) return { start: 0, end: null };
    return { start: Math.max(0, size - Number(m[2])), end: size - 1 };
  }
  return { start: Number(m[1] || 0), end: m[2] === '' ? null : Number(m[2]) };
}

function fetchUpstream(url, range) {
  return fetch(url, { headers: { Range: range }, signal: AbortSignal.timeout(15000) });
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end();
    return;
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.status(403).json({ error: 'Origen no permitido' });
    return;
  }

  const videoId = String(req.query.v || '');
  if (!/^[\w-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'ID de video inválido' });
    return;
  }
  const quality = ['low', 'normal', 'high'].includes(req.query.q) ? req.query.q : 'normal';
  const opusOk = req.query.opus === '1';

  try {
    let entry = await resolve(videoId, quality, opusOk, false);

    if (req.query.warm) {                    // solo precalentar la caché
      res.setHeader('Cache-Control', 'no-store');
      res.status(204).end();
      return;
    }

    let { start, end } = parseRange(req.headers.range, entry.size);
    if (entry.size) {
      if (start >= entry.size) {
        res.setHeader('Content-Range', `bytes */${entry.size}`);
        res.status(416).end();
        return;
      }
      const maxEnd = Math.min(entry.size - 1, start + CHUNK - 1);
      end = end == null ? maxEnd : Math.min(end, maxEnd);
    }
    const range = `bytes=${start}-${end == null ? '' : end}`;

    let upstream = await fetchUpstream(entry.url, range);
    if (upstream.status === 403 || upstream.status === 410) {
      // La URL firmada venció o pertenece a otra instancia: resolver de nuevo.
      entry = await resolve(videoId, quality, opusOk, true);
      upstream = await fetchUpstream(entry.url, range);
    }
    if (upstream.status !== 200 && upstream.status !== 206) {
      throw httpError(502, `YouTube respondió ${upstream.status}`);
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', entry.mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    ['content-length', 'content-range'].forEach(h => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    if (req.method === 'HEAD' || !upstream.body) {
      try { await upstream.body?.cancel(); } catch (_) {}
      res.end();
      return;
    }

    const body = Readable.fromWeb(upstream.body);
    req.on('close', () => body.destroy());
    body.on('error', () => { try { res.end(); } catch (_) {} });
    body.pipe(res);
  } catch (e) {
    const status = e.status || 502;
    if (status >= 500) console.error('[stream]', videoId, e.message);
    if (!res.headersSent) res.status(status).json({ error: e.message || 'No se pudo obtener el audio.' });
    else res.end();
  }
};
