// api/stream.js — Vercel Serverless Function
// Actúa de proxy entre el frontend y las instancias de Invidious.
// El browser no puede llamar a Invidious directo por CORS,
// pero el servidor sí puede — este endpoint lo resuelve.

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://yt.artemislena.eu',
  'https://invidious.flokinet.to',
  'https://invidious.perennialte.ch',
  'https://iv.datura.network',
];

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get('v');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return new Response(JSON.stringify({ error: 'videoId inválido' }), {
      status: 400,
      headers: corsHeaders('application/json'),
    });
  }

  // Intenta cada instancia hasta obtener una URL válida
  for (const instance of INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) }
      );
      if (!res.ok) continue;

      const data = await res.json();

      // Preferir audio puro (menor consumo de datos)
      const audioFormats = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio/'))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      // Busca el de mejor calidad sin pasarse de ~130kbps
      const best =
        audioFormats.find(f => (f.bitrate || 0) <= 130000 && f.url) ||
        audioFormats.find(f => f.url);

      if (best?.url) {
        return new Response(JSON.stringify({ url: best.url, instance, format: best.type }), {
          status: 200,
          headers: corsHeaders('application/json'),
        });
      }

      // Fallback: stream combinado (video+audio) si no hay audio puro
      const stream = (data.formatStreams || []).find(f => f.url);
      if (stream?.url) {
        return new Response(JSON.stringify({ url: stream.url, instance, format: stream.type }), {
          status: 200,
          headers: corsHeaders('application/json'),
        });
      }
    } catch (e) {
      // Instancia falló, prueba la siguiente
      continue;
    }
  }

  return new Response(JSON.stringify({ error: 'No se pudo obtener el audio. Intenta de nuevo.' }), {
    status: 502,
    headers: corsHeaders('application/json'),
  });
}

function corsHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
  };
}
