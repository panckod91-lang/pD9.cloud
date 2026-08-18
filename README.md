# D9 Pedidos PWA

PWA liviana para toma de pedidos comerciales con funcionamiento online/offline, cola local de pendientes y sincronización automática.

## Stack actual

- Frontend: HTML, CSS y JS puro.
- Hosting: Cloudflare Pages.
- Lectura de datos: Apps Script API (`?action=bootstrap`).
- Envío de pedidos: Cloudflare Worker.
- Base de datos: Google Sheets.

## Archivos principales

- `index.html`: estructura de la UI y modales.
- `styles.css`: diseño visual.
- `app.js`: lógica de datos, pedidos, historial, pendientes y sincronización.
- `sw.js`: service worker para cache offline de archivos propios.
- `manifest.json`: configuración PWA.

## Limpieza aplicada

- Eliminada la carpeta `netlify/`.
- Eliminado `netlify.toml`.
- Eliminadas referencias internas a Netlify.
- Eliminada lectura vieja vía OpenSheet.
- La app queda leyendo datos desde Apps Script mediante `BOOTSTRAP_URL`.
- Service Worker conserva estrategia network-first para archivos propios y no intercepta requests externos.

## v1.5.7-prod (fix ID congelado)
- Fix crítico: el pedido_id se congela para el pedido actual y se libera inmediatamente para que el próximo pedido no arrastre el mismo ID mientras el envío/verificación sigue en segundo plano.
- La verificación contra PC ya no valida sólo por ID: si el ID existe pero pertenece a otro cliente/productos/total, no lo toma como cargado.
- Se elimina el reintento automático con ID nuevo ante colisión, para no mezclar WhatsApp/PC ni esconder el error.
- Los duplicados controlados ahora se marcan como cargados en PC con mensaje claro: "Ya estaba cargado en PC. No se duplicó.".


## v1.5.8-prod (fix retorno WhatsApp)

- Corrige comparación numérica entre valores de Sheets (`$4.222,90`) y valores JS (`4222.900000000001`).
- Si el backend respondió `ok:true`, no se convierte el pedido en pendiente por una verificación posterior demasiado estricta.
- Apunta a eliminar warnings falsos al volver desde WhatsApp cuando el pedido ya está cargado en `pedidos`.
- Mantiene el fix de ID congelado/liberado de v1.5.7.


## v1.5.10 - retorno sin reintento
- Limpia pendientes falsos al volver de WhatsApp.
- Verificación más fiel contra hoja pedidos (`id_prod`, cantidad en `total`, total en `total_pedido`).
- Evita liberar el flujo antes de que termine la confirmación con Sheets.


## v1.5.12 - verifica antes de pendiente
- Re-verifica contra PC antes de mostrar un pendiente visible por pérdida de confirmación al volver de WhatsApp.


### v1.5.14 - mensaje OK cordial

- Base v1.5.13.
- Cambia los avisos visibles de duplicado controlado / ya estaba en PC por: "Pedido cargado correctamente en PC."
- Sin cambios de backend, Admin, marcas ni lista.

### v1.5.13 - logs depurados post-WhatsApp
- Mantiene el fix de v1.5.12: verifica antes de dejar pendiente visible.
- Evita reintentos/logs repetidos al volver desde WhatsApp si el pedido ya quedó OK recientemente.
- Reduce logs técnicos: `PEDIDO_ID_CONGELADO`, bloqueos internos y WhatsApp duplicado no se guardan salvo `?debugLogs=1`.
- No modifica backend/script, Admin, marcas ni modo de envío.
