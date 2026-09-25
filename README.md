# D9 Pedidos v1.5.41 PROD

## Integridad del Pedido convencional

- Antes de abrir WhatsApp o limpiar el editor, el snapshot completo queda en `d9_pendientes` con su `pedido_id` definitivo. También se intenta reflejar en Historial. Si la copia recuperable no puede verificarse, WhatsApp no se abre y el pedido visible no se limpia.
- La confirmación del backend quita exclusivamente el pendiente con ese `pedido_id`. Un error o una respuesta incierta conserva el mismo snapshot para reintento, sin regenerar su ID.
- `syncPending()` ya no reemplaza el almacenamiento con una cola calculada desde una fotografía vieja: reconcilia cada resolución contra el estado actual. Los pedidos agregados mientras espera la red permanecen intactos.
- Existe exclusión contra sincronizaciones reentrantes y una lease local breve para evitar dos sincronizaciones simultáneas desde ventanas de la misma PWA. La idempotencia del backend sigue siendo la protección definitiva ante reintentos.
- Para pedidos modernos, `pedido_id` es la identidad primaria. Dos pedidos con contenido idéntico e IDs diferentes nunca se confirman, eliminan ni bloquean entre sí. La comparación por contenido queda únicamente para registros legacy cuando ambos carecen de ID.

## Cambios puntuales

- Venta Mostrador permite cargar productos antes del cliente. El selector de productos muestra hasta 16 artículos globalmente frecuentes cuando no hay búsqueda ni filtros; el ranking se calcula al cargar datos sobre un tramo acotado del histórico de Pedidos y Ventas. Si aún no existe histórico utilizable, muestra productos disponibles.
- El cliente ocasional de Mostrador conserva nombre y datos descriptivos sin crear ficha; sólo admite Venta cobrada por completo en **efectivo**. Para transferencia, cheque o Cuenta Corriente se debe crear o seleccionar un cliente real. El backend de Gestión valida la restricción.
- Si falla la recarga de clientes después del login, se informa el error y se ofrece reintento al abrir el selector. El acceso TODOS sigue incluyendo todos los clientes activos; PROPIOS conserva su cartera y accesos adicionales.

## Clientes existentes en Mostrador

Al dar de alta un cliente, si hay coincidencias fuertes o posibles, se muestran **todas las fichas candidatas** con teléfono, ciudad, dirección y vendedor. Se puede usar cualquiera de ellas o crear expresamente una ficha nueva. Una coincidencia sólo por nombre no selecciona ni fusiona clientes automáticamente. Los criterios de coincidencia de v1.5.38 permanecen iguales: nombre y teléfono, nombre y domicilio, teléfono solo o nombre solo.

Al usar una ficha existente se conserva su `cliente_id` y se selecciona de inmediato. Si un usuario `PROPIOS` necesita incorporarla, se usa el mismo acceso idempotente de `clientes_accesos`; no cambia el vendedor comercial, los datos de la ficha, la comisión, la cuenta ni el permiso de edición. `TODOS` reutiliza la ficha sin crear acceso adicional. Si el usuario elige crear una nueva y había coincidencia fuerte, debe confirmarlo expresamente una segunda vez.

## Instalación

1. Sustituir únicamente el frontend de **D9 Pedidos** en el hosting con este paquete.
2. Conservar la configuración y las URLs actuales.
3. Recargar/cerrar y abrir la PWA hasta verificar `v1.5.41-prod (Integridad de Pedidos)`.

El Apps Script de Pedidos no cambió respecto de v1.5.40 y **no requiere reemplazo ni nuevo despliegue**. D9 Gestión permanece en v0.19.5. No ejecutar funciones `setup`: no hay columnas, hojas, propiedades ni migraciones nuevas. No cambia Worker.
