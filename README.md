# D9 Pedidos v1.5.37 PROD

Esta versión incorpora el alcance de clientes por usuario y conserva los circuitos productivos de Pedidos, Venta Zonal, Cuenta Corriente, ofertas, WhatsApp, pendientes y sincronización.

## Alcance de clientes

El campo central `alcance_clientes` admite:

- `PROPIOS`: el usuario sólo consulta y utiliza clientes asignados mediante `vendedor_id`; se conserva el respaldo legacy por nombre cuando el ID no existe.
- `TODOS`: el usuario puede consultar y utilizar todos los clientes activos, sin modificar vendedor, cartera ni comisiones.

Defaults compatibles para registros todavía sin valor:

- Mostrador y Cliente: `PROPIOS`.
- Vendedor y Admin: `TODOS`.

La edición del maestro sigue separada del permiso de uso. Un Mostrador con `TODOS` puede operar con un cliente ajeno, pero no editar su ficha. Si falta teléfono, puede usarlo sólo en el comprobante actual sin escribirlo en la ficha ajena.

## Clientes existentes

Antes del alta real de Mostrador se revisa el maestro completo:

- Coincidencia fuerte: mismo nombre + teléfono, o mismo nombre + domicilio (y misma ciudad cuando fue informada). No crea otra ficha.
- Coincidencia posible: mismo teléfono solo o mismo nombre solo. Informa el caso y exige confirmar expresamente que es otro comercio para crear una ficha distinta.

Con alcance `TODOS` se puede elegir la ficha existente sin reasignarla. Con `PROPIOS`, una coincidencia fuerte de otra cartera requiere intervención desde Gestión.

## Instalación

1. Reemplazar el código del Apps Script de D9 Pedidos por `apps-script/Code.gs`.
2. Crear una versión nueva del despliegue web conservando la misma URL y permisos actuales.
3. Reemplazar los archivos del frontend en el hosting.
4. Confirmar que la PWA muestre `v1.5.37-prod` y, si hiciera falta, cerrar y abrir o actualizar la aplicación.

No ejecutar funciones de inicialización. No cambia Worker. El frontend envía el token vigente en los pedidos modernos para que el backend pueda validar usuarios configurados como `PROPIOS`.
