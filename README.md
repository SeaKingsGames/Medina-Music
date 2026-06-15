# ⚡ NeonPlay

Reproductor de música tipo Spotify con estética glassmorphism neón, que toma música de YouTube.

## Características
- 🔍 Buscar canciones en YouTube (sin API key, vía Invidious)
- 🎵 Reproductor completo con progress bar y controles
- 📂 Playlists guardadas en localStorage
- ❤️ Favoritos
- 🎵 Cola de reproducción
- 📝 Letras automáticas vía lyrics.ovh
- 🔒 Wake Lock (pantalla activa mientras reproduce)
- 📱 Media Session (controles en pantalla de bloqueo Android)
- 📲 Instalable como PWA

## Archivos
```
index.html     → App principal
sw.js          → Service Worker (PWA offline)
manifest.json  → Manifest PWA (instalable)
icon-192.svg   → Ícono app
icon-512.svg   → Ícono app grande
```

## Subir a GitHub Pages

1. Crea un repo en GitHub (ej: `neonplay`)
2. Sube todos los archivos:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/neonplay.git
git push -u origin main
```
3. En GitHub → Settings → Pages → Source: `main` branch / `/ (root)`
4. Tu app estará en: `https://TU_USUARIO.github.io/neonplay/`

## Nota sobre pantalla bloqueada
- **Android Chrome**: Funciona ✅ — los controles aparecen en la notificación de bloqueo
- **iOS Safari**: Limitado ⚠️ — YouTube pausa cuando la pantalla se bloquea (limitación del sistema)
- La API Wake Lock mantiene la pantalla activa como alternativa

## Tecnologías
- YouTube IFrame Player API
- Invidious API (búsqueda sin API key)
- Lyrics.ovh API (letras)
- Web Media Session API (controles sistema)
- Screen Wake Lock API
- PWA (Service Worker + Web App Manifest)
