# D9 Pedidos v1.5.44 — frecuentes y progreso de Venta

Base: v1.5.43 estable. Cambio exclusivo del frontend de Pedidos. D9 Gestión v0.19.9, Apps Script de Pedidos y Cloudflare Worker permanecen sin cambios.

## Cambios

- Generar Pedido abre el selector con los mismos hasta 16 productos globalmente más usados que Venta Mostrador. Usa `productos_mas_usados` del bootstrap y su caché vigente; si no hay ranking disponible muestra hasta 16 productos con precio válido en orden alfabético. La búsqueda y los filtros de categoría/marca siguen prevaleciendo al aplicarse. El antiguo bloque de sugerencias locales del vendedor en este selector fue sustituido por la selección global y su rótulo se corrigió.
- Al confirmar el medio de pago de una Venta Mostrador, el modal permanece visible y ocupado mientras el backend confirma la intención financiera. Sólo tras obtener confirmación se informa «Venta registrada» y se prepara el modal existente de WhatsApp. El modal de pago se retira después de abrir el de WhatsApp. Ante error o resultado incierto se informa que no hay confirmación y se conserva el carrito. No se cambió la llamada financiera ni su reconciliación, identidad, guardado local o idempotencia.

## Archivos

- Modificados: `app.js`, `finance.js`, `styles.css`, `index.html` (versión de recursos) y `sw.js` (caché de esta versión), este README y el identificador raíz.
- Copiados sin modificación: `apps-script/Code.gs.txt` (Apps Script vigente de Pedidos) y `cloudflare-worker/worker.txt` (Worker vigente).
- Sin modificaciones de Sheets, configuración, URLs o D9 Gestión.

## Despliegue

1. Respaldar y reemplazar **sólo el frontend de D9 Pedidos** con los archivos de este ZIP. Conservar almacenamiento local y pendientes del dispositivo.
2. Mantener el deployment actual del Apps Script de Pedidos y el Worker; las copias TXT del ZIP son respaldo, no requieren actualización.
3. Abrir/actualizar la PWA y comprobar la etiqueta `v1.5.44 (Frecuentes y progreso de Venta)`. El Service Worker cambiará automáticamente su caché.
4. **No ejecutar setup** ni migrar Sheets. No actualizar D9 Gestión.

## Verificación

Prueba automatizada focalizada: `node tests/ux1544.test.cjs`. Comprueba ranking en Pedido y Venta, sustitución por búsqueda/categoría/marca, limpieza, fallback, estado durante confirmación, un solo intento ante doble toque, éxito y error. `node --check` sobre ambos JS. La revisión de diff confirma que las llamadas financieras, restricciones del ocasional, opciones de pago e idempotencia no se modificaron. No se hicieron pruebas físicas ni llamadas sobre datos reales.

Prueba física breve: abrir Generar Pedido sin filtros y luego buscar/filtrar; realizar una Venta de prueba observando el modal desde Confirmar hasta WhatsApp; probar error de red sin volver a registrar a ciegas; confirmar que no hay doble Venta ni movimiento. Probar los cuatro medios vigentes según el tipo de cliente (ocasional sólo efectivo).
