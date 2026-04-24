# pD9 Cloud PWA

PWA liviana para toma de pedidos comerciales con funcionamiento online/offline, cola local de pendientes y sincronización automática.

## Archivos principales

- `index.html`: estructura de la UI y modales.
- `styles.css`: diseño visual, barra de estado, bloqueo de selección accidental y botón sticky de productos.
- `app.js`: lógica de datos, pedidos, historial, pendientes y sincronización.
- `sw.js`: service worker para cache offline de archivos propios.
- `manifest.json`: configuración PWA.

## Datos externos

La app lee datos desde Google Sheets vía OpenSheet y envía pedidos por endpoint externo. El Service Worker no cachea requests externos para evitar precios/clientes/productos desactualizados.

## Cambios de esta versión limpia

- Corrige IDs de la tarjeta de pendientes: `pendingInfoTitle` / `pendingInfoText`.
- Actualiza cache del Service Worker a `d9-offline-v7`.
- Excluye APIs externas del cache del Service Worker.
- Incluye `icon-maskable-512.png` en precache.
- Elimina función destructiva de limpieza total de caches/SW.
- Unifica helpers de localStorage en `readJSON` / `saveJSON`.
- Centraliza texto del chip de soporte.
- Evita `innerHTML` para el nombre del usuario y conserva salto en 2 líneas con nodos seguros.
- Mantiene bloqueo de selección accidental de texto en la app.
- Mantiene botón `Aceptar selección` visible en el modal de productos.
- Elimina archivo fantasma `netlify/functions/1`.
