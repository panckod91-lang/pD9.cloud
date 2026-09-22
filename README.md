# D9 Pedidos v1.5.40 PROD

## Cambios puntuales

- Venta Mostrador permite cargar productos antes del cliente. El selector de productos muestra hasta 16 artículos globalmente frecuentes cuando no hay búsqueda ni filtros; el ranking se calcula al cargar datos sobre un tramo acotado del histórico de Pedidos y Ventas. Si aún no existe histórico utilizable, muestra productos disponibles.
- El cliente ocasional de Mostrador conserva nombre y datos descriptivos sin crear ficha; sólo admite Venta cobrada por completo en **efectivo**. Para transferencia, cheque o Cuenta Corriente se debe crear o seleccionar un cliente real. El backend de Gestión valida la restricción.
- Si falla la recarga de clientes después del login, se informa el error y se ofrece reintento al abrir el selector. El acceso TODOS sigue incluyendo todos los clientes activos; PROPIOS conserva su cartera y accesos adicionales.

## Clientes existentes en Mostrador

Al dar de alta un cliente, si hay coincidencias fuertes o posibles, se muestran **todas las fichas candidatas** con teléfono, ciudad, dirección y vendedor. Se puede usar cualquiera de ellas o crear expresamente una ficha nueva. Una coincidencia sólo por nombre no selecciona ni fusiona clientes automáticamente. Los criterios de coincidencia de v1.5.38 permanecen iguales: nombre y teléfono, nombre y domicilio, teléfono solo o nombre solo.

Al usar una ficha existente se conserva su `cliente_id` y se selecciona de inmediato. Si un usuario `PROPIOS` necesita incorporarla, se usa el mismo acceso idempotente de `clientes_accesos`; no cambia el vendedor comercial, los datos de la ficha, la comisión, la cuenta ni el permiso de edición. `TODOS` reutiliza la ficha sin crear acceso adicional. Si el usuario elige crear una nueva y había coincidencia fuerte, debe confirmarlo expresamente una segunda vez.

## Instalación

1. Sustituir el código del proyecto Apps Script de **D9 Pedidos** con `apps-script/Code.gs`.
2. Guardar y actualizar el despliegue web existente a una versión nueva, manteniendo su URL y configuración.
3. Sustituir los archivos del frontend de **D9 Pedidos** en el hosting. Conservar la configuración propia del sitio.
4. Recargar la PWA y verificar `v1.5.40-prod`.

Actualizar también D9 Gestión v0.19.5 y su Apps Script antes de probar Ventas ocasionales. No ejecutar funciones `setup`. Pedidos no agrega columnas, hojas ni migraciones; la lectura de frecuencia utiliza histórico existente. No cambia Worker.
