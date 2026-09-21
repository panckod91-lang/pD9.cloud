# D9 Pedidos v1.5.39 PROD

## Clientes existentes en Mostrador

Al dar de alta un cliente, si hay coincidencias fuertes o posibles, se muestran **todas las fichas candidatas** con teléfono, ciudad, dirección y vendedor. Se puede usar cualquiera de ellas o crear expresamente una ficha nueva. Una coincidencia sólo por nombre no selecciona ni fusiona clientes automáticamente. Los criterios de coincidencia de v1.5.38 permanecen iguales: nombre y teléfono, nombre y domicilio, teléfono solo o nombre solo.

Al usar una ficha existente se conserva su `cliente_id` y se selecciona de inmediato. Si un usuario `PROPIOS` necesita incorporarla, se usa el mismo acceso idempotente de `clientes_accesos`; no cambia el vendedor comercial, los datos de la ficha, la comisión, la cuenta ni el permiso de edición. `TODOS` reutiliza la ficha sin crear acceso adicional. Si el usuario elige crear una nueva y había coincidencia fuerte, debe confirmarlo expresamente una segunda vez.

## Instalación

1. Sustituir **sólo** el código del proyecto Apps Script de **D9 Pedidos** con `apps-script/Code.gs` (o el `Code.txt` idéntico).
2. Guardar y actualizar el despliegue web existente a una versión nueva, manteniendo su URL y configuración.
3. Sustituir los archivos del frontend de **D9 Pedidos** en el hosting. Conservar la configuración propia del sitio.
4. Recargar la PWA y verificar `v1.5.39-prod`.

No ejecutar funciones `setup`. No hay columnas, hojas ni migraciones nuevas. D9 Gestión v0.19.3 y su Apps Script no requieren actualización. No cambia Worker.
