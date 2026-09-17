# Publicación de D9 Pedidos v1.5.32-prod

## Fix incluido

Corrige una condición de carrera del circuito de pedidos normales. La versión anterior limpiaba el formulario al abrir WhatsApp y volvía a limpiarlo dentro del `finally` cuando terminaba la confirmación asíncrona del backend. Si el vendedor ya estaba armando otro pedido, ese segundo reset eliminaba el trabajo nuevo.

La v1.5.32:

- congela un snapshot independiente por pedido enviado;
- limpia el editor una sola vez al cerrar ese pedido;
- libera inmediatamente la interfaz para comenzar/enviar los siguientes;
- confirma cada operación en segundo plano por su propio `pedido_id`;
- no permite que una respuesta, error o reintento tardío modifique el pedido actual.

## Actualización

1. Reemplazar el frontend completo de D9 Pedidos por el contenido raíz del ZIP.
2. No actualizar Apps Script: `apps-script/Code.gs` y `Code.txt` se incluyen como referencia y no cambiaron.
3. No modificar el Worker.
4. No ejecutar funciones de setup ni modificar Sheets.
5. Cerrar y volver a abrir la PWA. La versión debe mostrar `v1.5.32-prod (fix pedidos consecutivos)`.

## Prueba recomendada

1. Enviar Pedido A.
2. Volver inmediatamente y enviar Pedido B.
3. Comenzar Pedido C con cliente, productos, cantidades, notas y oferta/precio elegido.
4. Esperar las confirmaciones de A y B.
5. Confirmar que C permanece exactamente intacto.

## Archivos modificados

- `app.js`: snapshot por pedido y desacople entre cierre visual y confirmación asíncrona.
- `index.html`, `manifest.json`, `sw.js`: versión y caché v1.5.32.
- `README.md` y esta guía: documentación.

No se modificaron `styles.css`, Apps Script, Worker, Venta Zonal, Lista de precios, Historial ni otros roles.
