// api/stream.js — Vercel Node.js Serverless Function (NO Edge — ytdl-core
// necesita APIs de Node que Edge Runtime no soporta).
//
// Extrae y transmite el audio DIRECTO de YouTube usando ytdl-core, sin
// depender de servidores de terceros (Invidious/Cobalt), que están siendo
// bloqueados cada vez más seguido por Google. Como este mismo servidor
// resuelve la URL firmada Y baja los bytes, se evita el problema de URLs
// "atadas" a la IP de otro servidor que causaba el error intermitente
// "No se pudo cargar el audio".
//
// Soporta Range (para que el seek del <audio> funcione bien en el navegador).

const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const videoId = req.query.v;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ error: 'videoId inválido' });
    return;
  }

  try {
    const info = await ytdl.getInfo(videoId);

    const audioFormats = ytdl
      .filterFormats(info.formats, 'audioonly')
      .filter(f => f.url)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    if (!audioFormats.length) {
      res.status(502).json({ error: 'Este video no tiene formatos de audio disponibles' });
      return;
    }

    // Preferir buena calidad sin pasarse de ~130kbps (menos datos, carga más rápido)
    const best = audioFormats.find(f => (f.audioBitrate || 0) <= 130) || audioFormats[0];

    const range = req.headers['range'];
    const upstream = await fetch(best.url, {
      headers: range ? { Range: range } : {},
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.status(502).json({ error: `YouTube respondió ${upstream.status} al pedir el audio` });
      return;
    }

    res.status(upstream.status); // 200 o 206 (partial content, habilita el seek)
    res.setHeader('Content-Type', (best.mimeType || 'audio/webm').split(';')[0]);
    res.setHeader('Cache-Control', 'no-store');
    ['content-length', 'content-range', 'accept-ranges'].forEach(h => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    // Reenvía el cuerpo de la respuesta al navegador en streaming
    const reader = upstream.body.getReader();
    req.on('close', () => { try { reader.cancel(); } catch (_) {} });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    console.error('[stream error]', e);
    if (!res.headersSent) {
      res.status(502).json({ error: e.message || 'No se pudo obtener el audio. Intenta de nuevo.' });
    } else {
      res.end();
    }
  }
};
                 
