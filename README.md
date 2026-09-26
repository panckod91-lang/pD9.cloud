# D9 Pedidos v1.5.42 — Bloque 2

Basado en frontend v1.5.41 y Apps Script v1.5.40. Cambian la autenticación de Pedido convencional, la autorización de anulación y el cierre de escrituras legacy de Admin/Venta Mostrador. El Worker y D9 Admin no cambian.

## Pedido y pendientes

- Un Pedido atribuido a un usuario exige sesión firmada vigente del mismo usuario. El Script toma nombre e ID de esa sesión y conserva la comprobación de cartera para PROPIOS. Un pedido de invitado genuino sigue sin identidad de vendedor ni `cliente_id` de maestro.
- La app almacena el snapshot y `pedido_id` antes de WhatsApp como en v1.5.41. El pendiente no almacena token: al reintentar usa la sesión vigente del usuario original. Si venció, conserva el pedido y pide ingresar nuevamente como el mismo usuario. No se cambia su ID ni se convierte en un pedido nuevo.
- La anulación exige sesión; el dueño persistido puede anular su Pedido y admin/superadmin pueden anular cualquiera, incluso invitados. Un dueño histórico ambiguo requiere revisión.
- Las rutas antiguas `guardar_venta_mostrador` / `save_venta_mostrador`, `update_clientes` / `upsert_clientes`, `update_productos` / `upsert_productos`, `update_publicidad` / `upsert_publicidad`, `update_config` y `update_usuarios` / `upsert_usuarios` rechazan escrituras. La Venta financiera y la administración vigente se realizan desde Gestión.

## Compatibilidad deliberada de Admin

El ZIP vigente de D9 Admin llama a `update_config`, `update_clientes`, `update_productos` y `update_publicidad` sin sesión. Admin ya fue declarado legacy y sus escrituras quedan deliberadamente deshabilitadas. La app y el repositorio de Admin no cambian. Usuarios se administra desde Gestión.

## Instalación propuesta

1. Reemplazar el frontend completo de **D9 Pedidos** con el contenido de este ZIP. Su código ya envía token al anular y mantiene el envío convencional de pedidos de v1.5.41. Dejar que los usuarios recarguen hasta ver `v1.5.42 (Autorización de Pedidos)`.
2. Reemplazar `Code.gs` únicamente en el proyecto Apps Script de **D9 Pedidos**, guardar y actualizar el despliegue existente con una nueva versión (misma URL). No ejecutar setup.
3. No modificar Worker, Admin ni Gestión. No crear hojas, columnas, propiedades ni contadores manualmente.

Durante el intervalo entre pasos, frontend v1.5.42 con backend anterior conserva la operatividad previa, pero la protección backend nueva todavía no rige. Si quedara una PWA v1.5.41 frente a backend v1.5.42, sus pedidos de usuario siguen incluyendo token al enviarse; la anulación desde esa PWA antigua carece de token y será rechazada hasta actualizarse. Las escrituras del Admin legacy dejarán de funcionar al actualizar el Script.

Un pendiente anterior atribuido a un usuario puede reintentarse al iniciar sesión como ese mismo usuario; si carece de ID de vendedor y declara nombre de vendedor, queda visible para revisión en lugar de atribuirlo automáticamente a invitado. La app no descarta pendientes por un error de autenticación.
