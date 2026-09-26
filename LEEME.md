# NeonPlay 3.0

## Estructura
```
index.html  manifest.json  sw.js  vercel.json  package.json
api/stream.js   → audio sin anuncios (ytdl-core, por bloques de 2 MB)
api/search.js   → búsqueda en YouTube (la API key vive en el servidor)
api/lyrics.js   → letras (sincronizadas cuando existen)
api/art.js      → portada cuadrada para la pantalla de bloqueo
icons/          → íconos PNG (Android, iPhone, favicon)
```
Puedes borrar `icon-192.svg` e `icon-512.svg` de la raíz: ya no se usan.

## Antes de desplegar (importante)
1. **Cambia tu API key de YouTube.** La anterior estaba escrita en el HTML y
   cualquiera podía copiarla. En Google Cloud Console → Credenciales, borra la
   vieja y crea una nueva restringida a "YouTube Data API v3".
2. En Vercel → tu proyecto → Settings → Environment Variables agrega:
   - `YT_API_KEY` = la clave nueva
   - `YT_REGION` = `MX` (opcional, es el valor por defecto)
3. Sube todo a GitHub; Vercel instala `sharp` y `@distube/ytdl-core` solo.

## Después de desplegar
- Abre la app, ciérrala y vuelve a abrirla una vez para que cargue la versión nueva.
- Tus playlists y favoritos de la versión anterior se pasan solos.
- Ajustes → Exportar biblioteca guarda un respaldo en tu teléfono.

## Si la música se corta con la pantalla bloqueada
- **Android:** Ajustes → Apps → Chrome (o NeonPlay) → Batería → "Sin restricciones".
- **iPhone:** instálala con Compartir → "Agregar a inicio" y ábrela desde ahí.

## Límites
- Búsquedas: YouTube da ~100 al día con una key gratuita. Las búsquedas repetidas
  salen de la caché de Vercel y no gastan cuota.
- Si YouTube bloquea temporalmente al servidor, la app salta la canción y avisa
  el motivo en lugar de ponerla con anuncios.
