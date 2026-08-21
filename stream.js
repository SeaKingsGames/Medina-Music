// api/stream.js — Vercel Edge Function
// Proxy COMPLETO entre el navegador y las instancias de Invidious.
//
// IMPORTANTE: no basta con devolver la URL de audio de Invidious al navegador
// porque esa URL viene firmada/atada a la IP del servidor de Invidious que la
// solicitó. Si el navegador del usuario intenta reproducirla directo desde
// otra IP, YouTube la rechaza (por eso "No se pudo cargar el audio" era
// intermitente). Acá resolvemos la URL Y bajamos los bytes desde este mismo
// servidor, para que la IP que pide el audio sea siempre la misma que lo
// resolvió. Esto también evita anuncios: nunca se carga el player de YouTube.

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.privacydev.net',
  'https://iv.melmac.space',
  'https://inv.tux.pizza',
  'https://invidious.protokolla.fi',
  'https://invidious.private.coffee',
  'https://yt.drgnz.club',
  'https://iv.datura.network',
  'https://invidious.fdn.fr',
  'https://invidious.perennialte.ch',
];

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('v');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return json({ error: 'videoId inválido' }, 400);
  }

  const range = req.headers.get('range');

  // Prueba cada instancia: resuelve la URL de audio Y reenvía los bytes.
  // Si una instancia da una URL "muerta" (403/expirada), pasa a la siguiente
  // en vez de fallar directo — esto es lo que antes causaba errores random.
  let lastErr = 'No se pudo obtener el audio. Intenta de nuevo.';

  for (const instance of INSTANCES) {
    let audioUrl, mime;
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) { lastErr = `Instancia ${instance} respondió ${res.status}`; continue; }

      const data = await res.json();

      const audioFormats = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      const best =
        audioFormats.find(f => (f.bitrate || 0) <= 130000 && f.url) ||
        audioFormats.find(f => f.url);

      if (best?.url) {
        audioUrl = best.url;
        mime = best.type;
      } else {
        const stream = (data.formatStreams || []).find(f => f.url);
        if (stream?.url) { audioUrl = stream.url; mime = stream.type; }
      }
    } catch (e) {
      lastErr = `Instancia ${instance} falló: ${e.message}`;
      continue;
    }

    if (!audioUrl) continue;

    // Reenvía los bytes reales del audio (proxy), no solo la URL.
    try {
      const upstream = await fetch(audioUrl, {
        headers: range ? { Range: range } : {},
        signal: AbortSignal.timeout(15000),
      });

      // Si la URL resuelta ya no sirve (403/404/expiró), prueba otra instancia
      // en vez de devolverle el error crudo al navegador.
      if (!upstream.ok && upstream.status !== 206) {
        lastErr = `Audio upstream ${upstream.status} en ${instance}`;
        continue;
      }

      const headers = corsHeaders(mime || upstream.headers.get('content-type') || 'audio/webm');
      const passthroughHeaders = ['content-length', 'content-range', 'accept-ranges'];
      passthroughHeaders.forEach(h => {
        const v = upstream.headers.get(h);
        if (v) headers[h] = v;
      });
      headers['Cache-Control'] = 'no-store';
      headers['X-Stream-Instance'] = instance;

      return new Response(upstream.body, {
        status: upstream.status, // 200 o 206 (partial content, para seek)
        headers,
      });
    } catch (e) {
      lastErr = `Fallo al transmitir desde ${instance}: ${e.message}`;
      continue;
    }
  }

  return json({ error: lastErr }, 502);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: corsHeaders('application/json') });
}

function corsHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
  };
}
