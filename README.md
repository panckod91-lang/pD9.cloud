# D9 Pedidos v1.5.45 — estado visual de ingreso

Base: v1.5.44. Cambio de frontend exclusivamente en el estado de espera del login. D9 Gestión v0.19.9, Apps Script de Pedidos y Cloudflare Worker no cambian.

## Ajuste

Al tocar «Ingresar» con conexión, Usuario, Clave y el botón se bloquean hasta que concluye el flujo de ingreso. El botón muestra «Ingresando…» y un spinner visual reutilizado. La clave sigue visible como puntos durante la espera. El mismo bloqueo cubre la actualización de clientes posterior a una respuesta de login correcta, evitando otro toque mientras se completa la entrada.

Si la autenticación falla, se conserva el mensaje de error actual, se restauran los controles y la clave permanece en el campo para corregirla o reintentar. Tras autenticación correcta, se mantienen sesión, carga y navegación actuales; la clave se limpia al finalizar. Ningún dato de clave se agrega al almacenamiento persistente.

## Archivos

Modificados: `app.js`, `styles.css`, `index.html` (versión de recursos) y `sw.js` (caché de la versión), además de este README e identificador del paquete. Nuevo test focalizado `tests/login1545.test.cjs`.

Copiados sin cambio: `apps-script/Code.gs.txt` y `cloudflare-worker/worker.txt`. No hay cambios en Sheets, endpoints, tokens, sesiones, pedidos pendientes, finanzas ni Gestión.

## Instalación

1. Respaldar y reemplazar sólo el frontend de D9 Pedidos con este ZIP. Conservar almacenamiento local y pendientes.
2. Actualizar la PWA y confirmar `v1.5.45 (Estado de ingreso)`; el Service Worker cambiará de caché.
3. Mantener los despliegues vigentes de Apps Script y Worker. Las copias TXT son respaldo, no instrucciones de reemplazo. No ejecutar setup ni migraciones.

## Pruebas

`node --check app.js`, `node --check finance.js`, `node tests/login1545.test.cjs` y `node tests/ux1544.test.cjs`: correctos. El test focalizado simula espera, éxito, error, reintento usando la clave conservada y doble toque. No se realizaron pruebas físicas ni llamadas a backend real.

Prueba física breve: ingresar con clave correcta y observar spinner, campos bloqueados y llegada al Home; repetir con clave incorrecta, confirmar que el error aparece y que se puede reintentar sin volver a escribirla.
