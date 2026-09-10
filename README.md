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
- `MODO_SIMPLE_Y_LISTAS.md`: activación en la Sheet y prueba segura en desarrollo.

## v1.5.28-prod - cierre y ofertas en Venta mostrador

- Los dos destinos de WhatsApp comienzan pendientes y cambian a verde después de abrir cada conversación.
- `Finalizar venta` advierte solamente por los destinos disponibles que todavía no se utilizaron.
- Al finalizar limpia el trabajo actual de Venta mostrador sin borrar ni registrar nuevamente la venta guardada.
- Venta mostrador reutiliza la misma lógica de ofertas de Generar pedido: precio normal inicial, aplicación manual y regreso al precio normal.
- El precio elegido y los datos de la oferta se conservan en el registro e historial local; total y WhatsApp utilizan ese precio.
- No modifica Apps Script, Worker, impresión, pedidos normales, otros roles ni módulos financieros.

## v1.5.27-prod - WhatsApp interno y cliente en Venta mostrador

- Conserva el circuito existente de Venta mostrador, su `venta_id`, guardado, historial e impresión.
- Registra la venta una sola vez y luego presenta dos destinos separados: copia interna y cliente.
- El destino interno continúa usando `wasap_report` del usuario y, como respaldo, el WhatsApp general de `confi`.
- El teléfono del cliente registrado se toma de su ficha.
- Si falta, permite guardarlo en la ficha mediante el `update_clientes` ya existente o continuar sin enviar al cliente.
- Los clientes ocasionales usan el teléfono ingresado en su carga, sin convertirse en clientes permanentes.
- Normaliza números argentinos habituales para WhatsApp y muestra cada destinatario antes de abrir la conversación.
- No modifica Apps Script, Worker, ventas, pedidos normales, otros roles ni módulos financieros.

## v1.5.26-prod - eliminación individual de pendientes

- Cada pedido de `Pendientes de envío` incorpora la acción discreta `Eliminar pendiente`.
- Antes de eliminar se confirma que el pedido todavía no está confirmado en la PC y dejará de reintentarse.
- Se elimina únicamente el registro seleccionado de la cola local `d9_pendientes`.
- La interfaz y el contador se actualizan inmediatamente.
- No cambia historial, IDs, envío, reintentos, sincronización automática, Worker ni Apps Script.

## v1.5.25-prod - buscador en Historial

- Agrega búsqueda instantánea por nombre de cliente.
- También encuentra por ID o número de pedido cuando está disponible en el historial local.
- Filtra solamente los movimientos ya mostrados por Historial y no cambia datos, envío, sincronización ni almacenamiento.
- No requiere cambios en D9 Script PROD ni en el Worker.

## v1.5.24-prod - vínculo seguro de clientes

- Los pedidos nuevos envían el `cliente_id` además del texto comercial visible.
- Gestión puede precargar el cliente por ID aunque el pedido incluya teléfono o dirección.
- Los pedidos anteriores siguen siendo compatibles mediante búsqueda segura por nombre.

## v1.5.23-prod - promoción aprobada de desarrollo

- Publica en producción la lógica validada durante dos días en `v1.5.22-dev`.
- Incorpora modo simple opcional, listas asignadas por cliente y cambio manual por pedido.
- Lista 2 y Lista 3 usan Lista 1 como respaldo visible cuando no tienen precio.
- Oculta productos que no poseen un precio válido en Lista 1.
- Incorpora ofertas con aplicación manual: cada producto entra inicialmente con su precio normal.
- Compacta Generar pedido y combina filtros de Categoría y Marca dentro del selector de productos.
- Mantiene los fixes productivos de IDs, pendientes, verificación en Sheet y retorno desde WhatsApp.
- No requiere cambios en D9 Script PROD, Cloudflare Worker ni estructura de pedidos.

## v1.5.22-dev - ofertas manuales y respaldo visible

- Los productos con oferta se agregan inicialmente con su precio normal.
- La oferta se aplica únicamente al pulsar el botón de la línea del pedido.
- Si Lista 2 o 3 hereda un precio, la línea identifica `respaldo Lista 1`.
- Al cambiar de lista, el aviso indica cuántos productos están usando el respaldo.

## v1.5.21-dev - Lista 1 como precio base

- Un producto sin precio válido en Lista 1 no aparece aunque figure activo.
- Lista 2 y Lista 3 usan automáticamente Lista 1 cuando su precio está vacío o en cero.
- Impide que cambiar de lista lleve un producto válido a precio cero.

## v1.5.20-dev - ofertas más visibles

- El botón de una oferta disponible muestra el fuego aun antes de aplicarla.
- Al aplicar la oferta, la línea del producto conserva visible el precio normal de lista.
- El selector de lista queda reducido a un control secundario alineado a la derecha.

## v1.5.19-dev - pantalla de pedido compacta

- Elimina el selector de categoría repetido de la pantalla principal.
- Dentro de Productos incorpora filtros compactos y combinables de Categoría y Marca.
- Mantiene `🔥 Productos en oferta` como categoría especial y permite combinarla con una marca.
- Reduce el selector de lista a una franja discreta; si se cambia manualmente queda resaltada suavemente.

## v1.5.18-dev - productos en oferta

- Incorpora la categoría virtual `🔥 Productos en oferta`.
- El precio normal de `lista_1/2/3` permanece intacto.
- Al agregar desde esa categoría aplica la oferta; desde otra categoría puede activarse en la línea del pedido.
- La oferta puede quitarse y volver al precio de la lista asignada al cliente.
- Guarda en el payload el precio de lista, `oferta_id` y si se usó la oferta; el Worker actual tolera esos campos sin cambios.

## v1.5.17-dev - selector de lista visible desde el primer ingreso

- Corrige la inicialización del selector `Lista para este pedido`.
- Ahora aparece al entrar por primera vez a `Generar pedido`, sin tener que visitar antes `Lista de precios`.
- También se actualiza cada vez que se vuelve a abrir la pantalla del pedido.
- Conserva el modo simple y las listas por cliente incorporadas en v1.5.16-dev.

## v1.5.16-dev - selector de modo y listas por cliente

- Agrega un botón `Modo normal / Modo simple` dentro de Ingreso de usuario.
- La elección queda guardada por usuario en ese celular o PC; no requiere columnas nuevas ni cambios en Apps Script.
- El modo simple muestra un inicio reducido, botones grandes y un recorrido guiado: cliente → productos → pedido.
- Prioriza clientes y productos usados recientemente en el dispositivo.
- Conserva historial y pendientes de forma secundaria, sin eliminarlos.
- Recupera la asignación de precios desde `clientes.lista_precio` (`lista_1`, `lista_2` o `lista_3`).
- El modo normal permite cambiar la lista para un pedido y modificar el precio unitario de una línea sin alterar la Sheet.
- Los pedidos guardan la lista utilizada y qué precios fueron modificados manualmente; el backend actual puede ignorar esos campos sin romper compatibilidad.
- El parámetro `?modoSimple=1` queda disponible únicamente como prueba técnica opcional.

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
