# Publicación de D9 Pedidos v1.5.31-prod

Esta entrega convierte la experiencia del rol `mostrador` en **Venta Zonal** y agrega la administración acotada de su propia cartera. No modifica D9 Gestión ni el Worker.

## Orden de actualización

1. Actualizar primero **D9 Script PROD** usando `apps-script/Code.txt` o `apps-script/Code.gs`, y crear una nueva versión del despliegue conservando la misma URL `/exec`.
2. Reemplazar después el frontend completo de D9 Pedidos por los archivos de este ZIP.
3. Cerrar y volver a abrir la PWA. Si Android conserva la versión anterior, usar la recarga/actualización habitual.
4. La información de versión debe mostrar `v1.5.31-prod (fix alta cliente Venta Zonal)`.

## Hotfix v1.5.31

- Corrige la referencia del frontend que mostraba `cliente is not defined` al crear o actualizar un cliente desde Venta Zonal.
- El error ocurría antes de enviar el POST, por lo que esos intentos fallidos no crearon clientes duplicados en la Sheet.
- No cambia el Script respecto de la entrega v1.5.30.

No ejecutar funciones de setup y no modificar Sheets manualmente. Al crear el primer cliente desde mostrador, el Script agrega únicamente las columnas faltantes `vendedor_id`, `vendedor` y `alta_request_id` al final de `clientes`. Esta última evita duplicar un alta si el navegador pierde la primera respuesta y utiliza el POST de respaldo.

## Rol mostrador

- El acceso principal se llama `VENTA ZONAL`.
- Se ocultan `GENERAR PEDIDO` e `Historial` de pedidos sólo para este rol.
- Conserva Lista de precios, Historial de ventas, Usuario y Pendientes y en espera.
- Agrega `Nuevo cliente` y `Mis clientes`.
- Venta Zonal y Mis clientes muestran únicamente clientes asignados al usuario mostrador por `vendedor_id`; los registros históricos sin ID admiten coincidencia exacta por nombre del vendedor.
- No se utiliza cliente ocasional para mostrador: el alta crea un cliente real y lo asigna automáticamente al usuario logueado.
- El alta desde Venta Zonal vuelve a la venta y selecciona el cliente recién creado.
- Mis clientes permite editar nombre, teléfono, dirección y ciudad de la cartera propia.
- Cambiar de usuario limpia únicamente el trabajo temporal de Venta Zonal para no arrastrar un cliente o carrito entre operadores.

## Compatibilidad preservada

- El circuito de pedidos e Historial permanece igual para vendedores normales.
- Continúan sin cambios venta_id, guardado de ventas, anti-duplicación, ofertas, doble WhatsApp, finalización/limpieza, impresión, logs y pendientes.
- Reutilizar una venta no permite cargar en Venta Zonal un cliente que ya no pertenece a la cartera actual.
- No se modifica D9 Gestión, cuentas corrientes, recibos, movimientos, comisiones, D9 Fiscal ni impresión térmica.

## Prueba real recomendada

1. Entrar con Petén y confirmar que ve Venta Zonal, Nuevo cliente, Mis clientes, Lista de precios, Historial de ventas, Usuario y Pendientes.
2. Confirmar que no ve Generar pedido ni Historial de pedidos.
3. Crear un cliente desde Home y verificar en `clientes` que se guardó con `vendedor_id` y `vendedor` de Petén.
4. Editar teléfono/dirección desde Mis clientes.
5. Abrir Venta Zonal y confirmar que no aparecen clientes de otros vendedores.
6. Crear otro cliente desde el selector, comprobar que vuelve seleccionado y completar una venta con oferta.
7. Probar los dos WhatsApp, Finalizar venta, Historial de ventas y el log `VENTA_MOSTRADOR_OK`.
8. Entrar con Mati/Cacho y confirmar que Generar pedido e Historial siguen funcionando igual.

## Archivos modificados

- `app.js`: rol, cartera, alta/edición y guardas de navegación.
- `styles.css`: presentación responsive de Mis clientes.
- `index.html`, `manifest.json`, `sw.js`: versión y caché v1.5.31.
- `README.md` y esta guía: documentación.

El ZIP contiene el frontend en la raíz y el Script claramente separado dentro de `apps-script/`. La carpeta del Script no debe subirse a Cloudflare Pages junto con el frontend.
