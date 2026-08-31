# D9 Pedidos v1.5.23-prod

Esta versión productiva incorpora el modo simple, listas por cliente y ofertas manuales que fueron aprobados previamente en desarrollo. El selector `Lista para este pedido` aparece desde la primera entrada a Generar pedido.

## Activar el modo simple para Cacho

1. Iniciar sesión con Cacho.
2. Tocar la tarjeta del usuario para abrir `Ingreso de usuario`.
3. Tocar el botón `Modo normal` ubicado junto al título.
4. El botón pasa a mostrar `✓ Modo simple` y la interfaz cambia inmediatamente.

La elección queda guardada para Cacho en ese celular o PC. No hace falta modificar la Sheet, Apps Script ni el Worker. Si se cambia de dispositivo o se borran los datos del navegador, se elige nuevamente.

Para probar el diseño con cualquier vendedor sin cambiar la Sheet, abrir la versión de desarrollo agregando `?modoSimple=1` a la URL. El usuario debe iniciar sesión normalmente.

## Listas de precio por cliente

- La hoja `clientes` debe usar la columna `lista_precio`.
- Valores admitidos: `lista_1`, `lista_2` o `lista_3`.
- La hoja `productos` conserva las columnas `lista_1`, `lista_2` y `lista_3`.
- Al seleccionar un cliente, D9 aplica automáticamente la lista indicada en su fila.
- Si la lista asignada no tiene precios mayores a cero, el modo simple avisa y no muestra productos sin precio.
- En modo normal, el vendedor puede cambiar la lista para ese pedido.
- El botón `Precio` permite modificar una línea únicamente para el pedido actual; no modifica la Sheet.

## Verificación posterior a la publicación

1. Confirmar que la versión visible sea `v1.5.23-prod`.
2. Sincronizar y verificar que aparezcan clientes, productos, ofertas y publicidad.
3. Iniciar sesión con Ale y confirmar que continúe en modo normal.
4. Iniciar sesión con Cacho y activar una vez el modo simple en su dispositivo de producción.
5. Enviar un pedido corto y confirmar WhatsApp, Sheet e historial local.
