// ===== ESTADO DE CONEXION =====
function actualizarEstadoConexion() {
  const dot = document.getElementById("statusRed");
  const text = document.getElementById("statusText");

  if (!dot || !text) return;

  if (navigator.onLine) {
    dot.classList.remove("status-offline");
    dot.classList.add("status-online");
    text.textContent = "Online";
  } else {
    dot.classList.remove("status-online");
    dot.classList.add("status-offline");
    text.textContent = "Offline";
  }
}

window.addEventListener("online", actualizarEstadoConexion);
window.addEventListener("offline", actualizarEstadoConexion);
document.addEventListener("DOMContentLoaded", actualizarEstadoConexion);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(() => console.log("SW listo"))
    .catch(err => console.log("SW error", err));
}
