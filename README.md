# D9 Pedidos v1.5.35 PROD

Etapa coordinada con D9 Gestión v0.19.0. Base: Pedidos v1.5.34 real. Este ZIP contiene solamente Pedidos y su propio Apps Script. No se publicó ni se modificó producción.

## Qué incorpora

Para cualquier usuario con rol `mostrador`, sin nombres ni IDs hardcodeados:

- Venta Zonal conserva clientes, productos, pesos, ofertas, historial y doble WhatsApp existentes.
- Antes de registrar, exige elegir Efectivo, Transferencia, Cheque o Cuenta corriente. No hay medio elegido por defecto.
- La Venta registra su efecto económico en la Cuenta Corriente real de Gestión. Su comprobante posterior no vuelve a generar deuda ni cobra otra vez.
- Home incorpora `CUENTA CORRIENTE` debajo de `VENTA ZONAL`: clientes propios, saldo real, movimientos recientes, `COBRAR` y `ENVIAR POR WHATSAPP` independientes.
- Cobro parcial/total por Efectivo, Transferencia o Cheque, usando recibos, pagos, movimientos y cheques existentes de Gestión.
- Tras confirmar un Cobro se reutiliza el modal de doble WhatsApp de Venta, pero compartir es opcional: interno, cliente, ambos o ninguno.
- Login validado en backend, sesión firmada y claves fuera del bootstrap/caché de usuarios.
- Bloqueo backend del editor antiguo de Usuarios de Admin: Gestión → Usuarios queda como único administrador efectivo.

## Instalación coordinada — ambos Scripts y ambos frontends

No habilitar operaciones financieras mientras uno de los dos componentes siga en la versión anterior.

1. Conservar los ZIP anteriores y hacer copias versionadas de las dos Sheets y proyectos Apps Script. No borrar pendientes de vendedores.
2. En **D9 Script PROD de Pedidos**, instalar `apps-script/Code.txt` de ESTE ZIP, idéntico a `Code.gs`. Actualizar el despliegue existente con una nueva versión, conservando URL `/exec`. No pegar aquí el Script de Gestión.
3. En **D9 Gestión**, instalar el Script de SU ZIP v0.19.0 y actualizar su despliegue conservando URL, IDs, secretos, permisos y contadores. **No ejecutar `setupD9Gestion()`**.
4. Gestión ahora valida sesiones contra Pedidos con `UrlFetchApp`; autorizar ese permiso si se solicita. Si su URL de Pedidos es distinta de la incluida, configurar la propiedad `PEDIDOS_API_URL` en el Script de Gestión. No crear claves maestras ni compartir secretos.
5. Verificar que `D9_FINANCE_URL` en `finance.js` apunta al Script real de Gestión. Gestión conserva su endpoint en `config.js`. Las URLs incluidas son las del baseline, no despliegues nuevos.
6. Reemplazar ambos frontends completos en sus alojamientos separados, incluyendo `finance.js` en Pedidos. Subir sólo archivos web: no publicar Apps Script, README ni copias de datos como recursos web.
7. Abrir con conexión, comprobar v1.5.35 / v0.19.0 e ingresar online en Pedidos para obtener la sesión nueva. No borrar datos del navegador para actualizar: podría borrar pedidos e intenciones inciertas.
8. **Antes de operar dinero real, rotar desde Gestión → Usuarios las claves antes distribuidas públicamente**, por claves nuevas y robustas. La corrección no vuelve secretas las claves que ya quedaron expuestas. Cambiarlas invalida los tokens Pedidos de la clave anterior.
9. Realizar el piloto descrito abajo. Revisar bajo autorización si hay despliegues anteriores públicos con claves/rutas inseguras: los cambios locales no retiran esos despliegues.

`PEDIDOS_SESSION_SECRET` se crea automáticamente al primer login en el proyecto Pedidos. No se envía al navegador ni debe cambiarse en cada actualización. Las columnas nuevas y el diario técnico se incorporan al primer uso; no hay que ejecutar setup financiero ni reiniciar numeraciones.

## Autenticación y compatibilidad deliberada

`login` comprueba usuario activo y clave en el maestro central. Devuelve el usuario sin secretos y token HMAC-SHA256 de alcance `pedidos`, ID y vencimiento de 30 días. La comprobación backend relee usuario activo y huella de credencial: cambiar clave o desactivar usuario revoca las nuevas operaciones autenticadas.

El bootstrap público no entrega `clave`, `password`, tokens ni campos de secretos del maestro usuarios. El frontend sanea `d9_cache_users`, no vuelve a guardar esas claves y vacía la contraseña del formulario tras login. El token se conserva separado de la identidad de trabajo, no contiene la contraseña original y no habilita una sesión administrativa de Gestión.

`update_usuarios` y `upsert_usuarios` están rechazados en el dispatcher backend; el helper también está deshabilitado. Se revisaron exclusivamente las rutas de usuarios/autenticación: no se encontró otra equivalente habilitada para cambiar credenciales, roles o permisos. También se rechazan peticiones con un token Pedidos de un usuario admin. No hay excepción Admin, parámetro oculto ni clave maestra.

**D9 Admin → Usuarios conserva su frontend antiguo pero su guardado quedó obsoleto.** No se modificó Admin. Para administrar claves/roles/permisos usar **Gestión → Usuarios**, con su sesión, autorización admin y controles existentes. Las contraseñas tampoco se entregan a un editor antiguo mediante bootstrap.

Alta/edición de clientes mostrador ahora exige token: el backend obtiene el creador autenticado y conserva la cartera propia. Gestión valida sesión, rol mostrador y cliente autorizado para las nuevas funciones financieras, sin permisos administrativos.

Esto NO es una migración general de seguridad. Las demás rutas legacy y Worker del Pedido convencional se conservaron; no se afirma una auditoría/protección general del ecosistema.

## Offline

Se conservan identidad/sesión de trabajo existente, productos/clientes cacheados, armado de Pedidos, cola de pendientes y sincronización posterior. Un nuevo login requiere conexión: ya no compara claves distribuidas al navegador.

Registrar Venta financiera, consultar CC, Cobrar o registrar Cheque requieren conexión. Sin conexión no se registra ni se encola dinero; el carrito se conserva para recuperar señal. La identidad anterior permite seguir con Pedidos offline; finanzas y edición segura de clientes requieren ingresar online una vez.

## Venta Zonal

Cliente/productos como antes → registrar/WhatsApp o impresión existente → elegir medio obligatorio → confirmar registro financiero → WhatsApp interno/cliente o impresión → finalizar.

- Cuenta corriente: una deuda por el total, sin recibo.
- Efectivo/Transferencia/Cheque: débito y recibo/pago compensatorio por el mismo total, saldo neto cero de ESA Venta. No borra otra deuda previa del cliente.
- Transferencia: referencia opcional, como Gestión.
- Cheque: banco/número/vencimiento obligatorios, librador opcional. Se guarda un cheque real EN_CARTERA con su recibo/pago; no supone cobro bancario definitivo.
- Precios elegidos y ofertas se conservan; no se recotiza con el maestro. Subtotales y total se redondean a centavos como Gestión, conservando cantidades/pesos y precio unitario.
- Imprimir/compartir una Venta confirmada reutiliza su registro: no genera otra Venta ni otro efecto económico.
- Finalizar limpia sólo ese trabajo, no el registro. Una respuesta tardía no limpia otra Venta o Pedido.

WhatsApp muestra la condición real cuando existe. Verde significa que D9 **abrió WhatsApp**, no envío comprobado. No cambió el formato A4 ni se agregó térmica/Bluetooth.

## Cuenta corriente y Cobrar

Clientes propios, autorizados nuevamente en backend. La consulta trae saldo global y últimos 20 movimientos reales de Gestión con saldo acumulado; saldo negativo se muestra a favor.

Cobrar permite importe parcial, medio e imputación. Se conserva la regla vigente:

- Una sola operación con saldo se propone automáticamente.
- Con varias, elegir una o `A cuenta, sin operación específica`.
- Un cobro imputado no supera su saldo; para crédito adicional elegir A cuenta.
- **A cuenta baja el saldo global pero no cancela automáticamente saldos individuales de comprobantes.** No hay FIFO/reparto nuevo; saldo global y suma documental pueden diferir como antes en Gestión.

El recibo confirmado muestra número real, fecha, cobrador, saldo anterior, importe, medio y saldo posterior; con cheque, sus datos. WhatsApp/finalizar no registran dinero. Los destinos usan snapshot de la operación y configuración interna del usuario, no otro cliente que se seleccione después.

`ENVIAR POR WHATSAPP` refresca la cuenta y prepara saldo/movimientos para el cliente, sin crear recibos ni movimientos. Sin teléfono, se reutiliza el editor existente para guardarlo realmente en su ficha o puede omitirse. No bloquea ni revierte un cobro ya confirmado.

## Timeout, doble toque y recuperación

La Venta usa el `venta_id` existente; cada Cobro usa un `intencion_id` estable. Snapshot, usuario, cliente, importe y medio quedan congelados antes de enviar.

`d9_finance_intentions` guarda localmente snapshots/IDs antes del POST. **No es cola offline ni se envía automáticamente al reconectar.** Conserva todas las inciertas y hasta 100 confirmadas; muestra hasta 10 recibos recientes de este dispositivo.

Ante pérdida de respuesta no hay éxito/recibo inventado. Usar **Verificar resultado**:

1. Confirmada: recuperar resultado sin volver a escribir.
2. Preparada parcialmente: confirmación explícita para completar el mismo plan, IDs y número.
3. No existe: confirmación explícita para reintentar el mismo snapshot/ID.

No crear otro ID para reemplazar una incierta. No borrar datos locales mientras haya intenciones inciertas. Una operación parcial bloquea nuevas mutaciones financieras de ese cliente hasta reconciliarla, no Pedidos convencionales ni otra edición. Confirmación A no cierra modal B, no cambia cliente ni carrito; logs conservan el autor original tras cambio de usuario.

## Gestión e históricos

Campos agregados en `ventas`: `medio_pago`, `finanzas_id`, `finanzas_item`; éste permite recuperar filas parciales sin duplicar ítems. Una operación sigue agrupada por `venta_id`.

Gestión usa movimientos `VTA-<venta_id>` y `finanzas_venta_id` en el documento posterior. Exige mismo cliente y total; NO nueva deuda ni segundo cobro inicial. Anular ese documento no revierte dinero que no creó. NC/pagos vinculados resuelven el mismo origen, preservando permisos/cierres.

Ventas antiguas sin intención/condición siguen consultándose/imprimiéndose; no se adivina medio ni se genera deuda/recibo retroactivo. Su comprobante mantiene el circuito anterior. El nuevo endpoint no agrega finanzas a un ID histórico existente.

## Archivos modificados

- `app.js`: login/caché saneada, integración financiera con cierres existentes, condición en historial/texto, snapshots seguros para WhatsApp/teléfono y logs.
- Nuevo `finance.js`: CC, Venta/Cobro, medios, verificación/intenciones, protección ante respuestas tardías.
- `styles.css`: estilos localizados y responsive de controles/cuenta/modales.
- `index.html`: carga del módulo y versión de recursos.
- `manifest.json`, `sw.js`: versión/caché, incluyendo finance.js; sin cola de dinero.
- `apps-script/Code.gs` y `Code.txt`: login/sesión, bootstrap sin claves, clientes autenticados, rutas Usuarios bloqueadas, rechazo de ventas financieras por ruta legacy.
- `README.md`: instalación e informe.

Pedidos NO lleva otra contabilidad: escribe financieramente Gestión. No cambian Worker/Admin/Fiscal, generación de IDs, envío/pendientes convencionales, PDFs, listas 1/2/3 ni ofertas.

## Pruebas y límites

Pasaron **23 pruebas backend** con Scripts reales y Sheets simuladas, y **14 frontend/estado** con código real y respuestas controladas:

- Login/firma, token alterado, cambio de clave/desactivación, rol/cartera, escrituras antiguas rechazadas incluso con token Pedidos admin. Gestión admin conserva Usuarios y rechaza vendedor/sin token.
- CC $50.000 + comprobante = $50.000; efectivo + comprobante = $0; CC $50.000 + cobro imputado $20.000 + comprobante = $30.000; cheque único sin doble deuda.
- Referencias/transferencia, cobros parciales, crédito a favor, cheque/rechazo, IDs/cliente/importe inmutables, históricos y precios de oferta/decimales.
- Fallos después de escritura parcial en ventas/recibos/pagos/cheques/movimientos/diario y reconciliación sin duplicaciones.
- Comprobante sin segundo efecto, anulación documental y NC sobre origen financiero, sin doble devolución por documentos repetidos.
- Cancelar = cero cambios; offline conserva carrito sin cola de dinero; doble gesto = un selector/registro; modal doble reutilizado, recibo/saldos reales y estado de cuenta sólo lectura.
- Consultas/cobros tardíos no sustituyen otro cliente/modal ni Venta nueva; log conserva autor original.
- **Pedido A → B → C; confirmar B antes de A: C conservó cliente, productos, cantidades, observaciones y oferta/precio.** Código de envío/callback/pendientes protegido comparado con la base.
- Tests existentes de búsqueda (32 combinaciones y control Generar comprobante) e histórico/filtros/acciones/navegación responsive de Ventas ejecutados contra las carpetas nuevas.

No hubo pruebas con Sheets/dinero reales. Checks responsive estructurales; **no se pudo ejecutar prueba visual automatizada porque no hay Chromium instalado**. Quedan revisión física PC/móvil, Android/WhatsApp y piloto financiero. No se afirma regresión general.

### Piloto antes de uso general

Cliente de prueba de cartera mostrador: cuatro escenarios anteriores, misma CC en ambas apps, Recibos/Pagos/Cheques visibles, crear/anular documento sin variar saldo indebidamente. Cobros por tres medios, cancelar medio antes de guardar, perder conexión después de confirmar y verificar mismo ID. Teléfono ausente, WhatsApp opcional de cobro, doble WhatsApp/limpieza de Venta, impresión y precios/oferta. PC/móvil: Home/cuenta/modales. Vendedor normal: Pedido offline y A → B → C fuera de orden.

## Volver atrás

**Con Ventas financieras reales, no volver sin coordinación al backend anterior.** Puede reexponer claves/escritura Usuarios o duplicar/revertir deuda al documentar/anular ventas nuevas. Copias para recuperación controlada, no restauración automática de datos financieros. Una reversión visual debe conservar backends seguros y procedencia financiera o acordarse antes.

Informe técnico completo de 26 puntos también en el README del ZIP Gestión v0.19.0. Cada app conserva su Script/endpoint propio. Sólo README informativo; Code.txt es fuente.
