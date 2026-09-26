// api/art.js — Portada cuadrada para la pantalla de bloqueo y el reproductor.
//
// Las miniaturas de YouTube son 16:9 (y la de calidad media trae barras
// negras). Aquí se recorta al centro en 512×512, que es justo la portada
// del álbum en los videos "Topic". Vercel guarda el resultado 30 días en su
// CDN, así que cada portada se procesa una sola vez.

const sharp = require('sharp');

async function grab(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

module.exports = async (req, res) => {
  const id = String(req.query.v || '');
  if (!/^[\w-]{11}$/.test(id)) { res.status(400).end(); return; }

  try {
    let src = await grab(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
    if (src && (await sharp(src).metadata()).width < 640) src = null;   // "no existe" = imagen gris de 120 px

    if (!src) {
      src = await grab(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
      if (!src) throw new Error('sin miniatura');
      // hqdefault trae barras negras arriba y abajo: se recortan
      try { src = await sharp(src).trim({ background: '#000000', threshold: 18 }).toBuffer(); } catch (_) {}
    }

    const out = await sharp(src)
      .resize(512, 512, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000');
    res.status(200).send(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.redirect(302, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  }
};
