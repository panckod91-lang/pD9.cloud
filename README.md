# D9 Pedidos v1.5.43 — Invitado y pendientes

Corrección frontend localizada sobre v1.5.42. El Apps Script de Pedidos v1.5.42, Worker, Gestión y Admin no cambian.

## Causa y corrección

El invitado guarda en su snapshot una ficha local con `id: ocasional_...`. Al transmitirlo en v1.5.42, ese ID se enviaba como `cliente_id` de maestro y el backend lo rechazaba correctamente. El snapshot no se altera: al generar el request, sólo si el pedido original no declara vendedor y el cliente original está marcado `ocasional: true`, se envía `cliente_id` vacío. El nombre, teléfono y dirección viajan en `cliente`; `pedido_id` no cambia. Un vendedor registrado sigue requiriendo sesión y no puede enviarse como invitado declarando su nombre/ID sin token.

Los pendientes de invitado creados en v1.5.42 mantienen el mismo ID y pueden reintentarse tras actualizar el frontend, aun si entretanto se inició sesión como vendedor. `syncPending()` siempre reconstruye el request desde el snapshot original; no hereda vendedor ni token del usuario actual.

## Instalación y prueba

1. Reemplazar sólo el frontend de D9 Pedidos por este ZIP y confirmar `v1.5.43 (Invitado y pendientes)` en el dispositivo. No borrar datos locales ni pendientes.
2. Mantener el despliegue vigente del Apps Script de Pedidos v1.5.42 y el Worker sin cambios. No ejecutar setup.
3. Abrir Pendientes y reintentar el pedido de invitado existente; comprobar que llega a Sheets con el mismo `pedido_id`, sin `vendedor_id` registrado y con los datos descriptivos del invitado.
4. Enviar un invitado nuevo; comprobar un pedido de usuario autenticado y que una identidad declarada sin sesión se rechaza.

Pruebas simuladas: invitado con sesión ajena activa, reintento con ID original; 31 verificaciones backend del Bloque 2; expiración de sesión y pendientes; 9/9 integridad v1.5.41. No se realizaron pruebas físicas en este entorno.
