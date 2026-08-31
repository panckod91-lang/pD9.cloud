# Publicación de D9 Pedidos v1.5.23-prod

Esta entrega reemplaza únicamente el frontend alojado en producción. Conserva las mismas URLs de D9 Script PROD y del Worker productivo.

## Antes de publicar

- Conservar disponible el último despliegue productivo `v1.5.14-prod` para rollback.
- No modificar D9 Script PROD, el Worker ni las pestañas de la Sheet.
- No borrar datos del sitio en los dispositivos: usuarios, historial, borradores y pendientes mantienen las mismas claves locales.

## Publicación

1. Subir el contenido de este ZIP a la raíz del repositorio productivo `pD9.cloud`.
2. Esperar que Cloudflare Pages finalice el despliegue.
3. Abrir D9 Pedidos y actualizar. La versión debe mostrar `v1.5.23-prod (modo simple, listas y ofertas)`.
4. Pulsar Sync y comprobar que carguen productos, clientes, ofertas y publicidad.
5. En el dispositivo de Cacho, entrar a Ingreso y activar una vez `Modo simple`.

## Comportamientos esperados

- Todos los usuarios continúan inicialmente en modo normal.
- La lista del cliente se aplica al seleccionarlo.
- Lista 2 y 3 heredan Lista 1 cuando su precio está vacío o en cero, mostrando el respaldo.
- Un producto sin precio válido en Lista 1 no se ofrece.
- Los productos con oferta entran con precio normal; el vendedor aplica la oferta tocando el botón con fuego.
- Los pedidos continúan enviándose al Worker y D9 Script PROD actuales.

## Rollback

Si aparece un problema operativo, restaurar desde Cloudflare Pages el último despliegue productivo anterior. No modificar la Sheet ni reenviar pedidos que ya estén confirmados en PC.
