const WEBHOOK_ENDPOINTS = [
  "https://d9-pedidos-prod-worker.pancko-d9.workers.dev/"
];
const BOOTSTRAP_URL = "https://script.google.com/macros/s/AKfycbwg8YQ7lqtLFbxnmtHnM3TxHaCaVoHQ_7AJHKPhiQRyrX6OyqO004F2pSABjI5df3yI/exec?action=bootstrap";
const APP_VERSION = "v1.4.9-prod (fix definitivo pendientes home)";
const AUTO_REFRESH_MS = 10 * 60 * 1000;
const FOREGROUND_REFRESH_MIN_MS = 5 * 60 * 1000;
let lastAutoRefreshAtD9 = 0;
let autoRefreshStartedD9 = false;
let isAppUpdateAvailableD9 = false;
const STORAGE_KEYS = {
  seller: "d9_usuario",
  history: "d9_historial",
  salesHistory: "d9_historial_ventas_mostrador",
  pending: "d9_pendientes",
  drafts: "d9_borradores_en_espera",
  guestClient: "d9_invitado_cliente",
  versionLogged: "d9_version_logged",
  logsQueue: "d9_app_logs_queue",
  deviceId: "d9_device_id"
};
let d9DeferredInstallPrompt = null;
let d9InstallPromptReady = false;
let d9InstallSetupDone = false;
const d9HistoryResyncLocks = new Set();

const CACHE_KEYS = {
  config: "d9_cache_config",
  users: "d9_cache_users",
  clients: "d9_cache_clients",
  products: "d9_cache_products",
  ads: "d9_cache_ads",
  support: "d9_cache_support",
  lastSync: "d9_cache_last_sync"
};

const state = {
  config: {},
  users: [],
  clients: [],
  products: [],
  ads: [],
  support: {},
  seller: null,
  activePriceList: "lista_1",
  priceSearch: "",
  priceCategory: "",
  selectedClient: null,
  guestClientDraft: null,
  selectedCategory: "",
  cart: [],
  orderNoteGeneral: "",
  mostradorClient: null,
  mostradorCategory: "",
  clientPickerMode: "order",
  categoryPickerMode: "order",
  currentView: "home",
  historyOpenId: null,
  salesHistoryOpenId: null,
  isSending: false,
  isSyncing: false,
  manualPriceOverride: false,
  hasLoadedData: false,
  orderSendLockUntil: 0,
  lastOrderFingerprint: "",
  qtyModalItemId: "",
  qtyModalMode: "order",
  mostradorSearch: "",
  mostradorCart: [],
  mostradorVentaDraftId: "",
  mostradorVentaFingerprint: "",
  productPickerMode: "order"
};

const bannerCarousel = {
  index: 0,
  timer: null,
  delay: 5200,
  signature: "",
  touchStartX: 0,
  touchStartY: 0,
  isAnimating: false
};

const $ = (s) => document.querySelector(s);
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(v) || 0);

const money2 = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(v) || 0);
function isMostradorD9() {
  return String(state.seller?.rol || "").trim().toLowerCase() === "mostrador";
}
function parseDecimalD9(value) {
  if (value === null || value === undefined) return 0;

  let s = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\$/g, "");

  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Formato argentino: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // Decimal con coma: 0,5
    s = s.replace(",", ".");
  } else {
    // Decimal con punto: 0.5
    // No removemos el punto, porque en cantidad es más probable que sea decimal manual.
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmtQtyD9(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 3, maximumFractionDigits: 3 }).format(n);
}

function tapFeedbackD9() {
  try {
    if (navigator.vibrate) navigator.vibrate(18);
  } catch (_) {}
}

function setSyncChipBusyD9(busy) {
  const btn = $("#btnPancko");
  if (!btn || isAppUpdateAvailableD9) return;

  btn.classList.toggle("is-syncing-d9", !!busy);
  btn.textContent = busy ? "↻ Sync..." : "↻ Sync";
}


function parseD9Number(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  let s = String(value)
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .trim();

  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    if (lastComma > lastDot) {
      // Formato AR: 27.172,97
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 3,025.00
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal con coma: 27172,97
      s = parts[0].replace(/\./g, "") + "." + parts[1];
    } else {
      // Miles con coma: 26,128
      s = s.replace(/,/g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const readJSON = (k, f = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function getApiBaseD9() {
  return BOOTSTRAP_URL.split("?")[0];
}

function getVersionDateD9() {
  return new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}


const D9_LOG_MAX_QUEUE = 120;
const D9_LOG_DETAIL_MAX = 420;
const D9_SESSION_ID = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
let d9LogsFlushRunning = false;

function makeClientDeviceIdD9() {
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `dev_${Date.now().toString(36).toUpperCase()}_${rnd}`;
}

function getDeviceIdD9() {
  let id = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (!id) {
    id = makeClientDeviceIdD9();
    localStorage.setItem(STORAGE_KEYS.deviceId, id);
  }
  return id;
}

function shortLogDetailD9(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.slice(0, D9_LOG_DETAIL_MAX);
  try {
    return JSON.stringify(value).slice(0, D9_LOG_DETAIL_MAX);
  } catch (_) {
    return String(value).slice(0, D9_LOG_DETAIL_MAX);
  }
}

function pedidoClienteLogD9(payloadOrData) {
  const c = payloadOrData?.cliente || {};
  return c.nombre_real || c.nombre || payloadOrData?.cliente_nombre || payloadOrData?.clienteName || "";
}

function safePedidoFingerprintD9(payload) {
  try {
    if (!payload) return "";
    return buildOrderFingerprint(payload);
  } catch (_) {
    return "";
  }
}

function buildAppLogPayloadD9(evento, data = {}) {
  const payload = data.payload || data.pedido || data.order || null;
  const vendedorObj = payload?.vendedor || {};
  const seller = state.seller || {};
  const vendedorId = String(data.vendedor_id || vendedorObj.id || seller.id || "").trim();
  const vendedor = String(data.vendedor || vendedorObj.nombre || seller.nombre || "").trim();
  const pedidoId = String(data.pedido_id || data.pedidoId || payload?.pedido_id || payload?.pedidoId || "").trim();
  const cliente = String(data.cliente || pedidoClienteLogD9(payload) || "").trim();
  const totalRaw = data.total ?? payload?.total ?? "";
  const total = totalRaw === "" || totalRaw === null || typeof totalRaw === "undefined" ? "" : Number(totalRaw) || 0;

  return {
    action: "log_evento",
    fecha_local: getVersionDateD9(),
    vendedor_id: vendedorId,
    vendedor,
    device_id: getDeviceIdD9(),
    session_id: D9_SESSION_ID,
    app_version: APP_VERSION,
    evento: String(evento || "EVENTO").trim().toUpperCase(),
    pedido_id: pedidoId,
    cliente,
    total,
    fingerprint: String(data.fingerprint || safePedidoFingerprintD9(payload) || "").slice(0, 280),
    online: navigator.onLine ? "si" : "no",
    resultado: String(data.resultado || data.status || "").slice(0, 80),
    detalle: shortLogDetailD9(data.detalle ?? data.detail ?? data.error ?? "")
  };
}

function getQueuedLogsD9() {
  const rows = readJSON(STORAGE_KEYS.logsQueue, []);
  return Array.isArray(rows) ? rows : [];
}

function saveQueuedLogsD9(rows) {
  saveJSON(STORAGE_KEYS.logsQueue, Array.isArray(rows) ? rows.slice(-D9_LOG_MAX_QUEUE) : []);
}

function enqueueAppLogD9(payload) {
  const queue = getQueuedLogsD9();
  queue.push(payload);
  saveQueuedLogsD9(queue);
}

async function postAppLogPayloadD9(payload) {
  const apiBase = getApiBaseD9();
  const body = JSON.stringify(payload);

  async function tryPost(options) {
    const r = await fetch(`${apiBase}?action=log_evento`, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      ...options
    });
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("Respuesta no JSON del log: " + text.slice(0, 160));
    }
    if (data?.ok === true) return data;
    throw new Error(data?.error || text.slice(0, 160) || "log_evento no confirmado");
  }

  try {
    return await tryPost({
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
  } catch (firstErr) {
    return await tryPost({
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: "payload=" + encodeURIComponent(body)
    });
  }
}

function logAppEventD9(evento, data = {}) {
  const payload = buildAppLogPayloadD9(evento, data);
  if (!navigator.onLine) {
    enqueueAppLogD9(payload);
    return;
  }

  postAppLogPayloadD9(payload)
    .then(() => {
      if (getQueuedLogsD9().length) flushAppLogsD9();
    })
    .catch(err => {
      console.warn("[D9] log_evento quedó en cola:", evento, err);
      enqueueAppLogD9(payload);
    });
}

async function flushAppLogsD9() {
  if (d9LogsFlushRunning || !navigator.onLine) return;
  const queue = getQueuedLogsD9();
  if (!queue.length) return;

  d9LogsFlushRunning = true;
  const remaining = [];
  try {
    for (const row of queue) {
      try {
        await postAppLogPayloadD9(row);
      } catch (err) {
        remaining.push(row);
      }
    }
    saveQueuedLogsD9(remaining);
  } finally {
    d9LogsFlushRunning = false;
  }
}


async function postVersionLogD9(payload) {
  const apiBase = getApiBaseD9();
  const body = JSON.stringify(payload);

  async function tryPost(options) {
    const r = await fetch(`${apiBase}?action=log_version`, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      ...options
    });

    const text = await r.text();

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error("Respuesta no JSON del script: " + text.slice(0, 160));
    }
  }

  try {
    return await tryPost({
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
  } catch (firstErr) {
    console.warn("[D9] log_version text/plain falló, pruebo payload form", firstErr);
    return await tryPost({
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: "payload=" + encodeURIComponent(body)
    });
  }
}

async function registerAppVersionD9() {
  try {
    const alreadyInSheet = String(state.support?.version || "").trim() === APP_VERSION;

    if (alreadyInSheet) {
      localStorage.setItem(STORAGE_KEYS.versionLogged, APP_VERSION);
      return;
    }

    if (localStorage.getItem(STORAGE_KEYS.versionLogged) === APP_VERSION) {
      return;
    }

    const fecha = getVersionDateD9();

    const result = await postVersionLogD9({
      action: "log_version",
      version: APP_VERSION,
      fecha
    });

    if (!result?.ok) {
      throw new Error(result?.error || "El script no confirmó log_version");
    }

    state.support = {
      ...(state.support || {}),
      version: APP_VERSION,
      version_fecha: fecha
    };

    saveJSON(CACHE_KEYS.support, state.support);
    localStorage.setItem(STORAGE_KEYS.versionLogged, APP_VERSION);

    console.log("[D9] Versión registrada en soporte", APP_VERSION, fecha);
  } catch (err) {
    console.warn("[D9] No se pudo registrar versión:", err);
  }
}

function hydrateCacheState() {
  state.config = readJSON(CACHE_KEYS.config, state.config || {});
  state.users = readJSON(CACHE_KEYS.users, state.users || []);
  state.clients = readJSON(CACHE_KEYS.clients, state.clients || []);
  state.products = readJSON(CACHE_KEYS.products, state.products || []);
  state.ads = readJSON(CACHE_KEYS.ads, state.ads || []);
  state.support = readJSON(CACHE_KEYS.support, state.support || {});
}
function persistCacheState() {
  saveJSON(CACHE_KEYS.config, state.config || {});
  saveJSON(CACHE_KEYS.users, state.users || []);
  saveJSON(CACHE_KEYS.clients, state.clients || []);
  saveJSON(CACHE_KEYS.products, state.products || []);
  saveJSON(CACHE_KEYS.ads, state.ads || []);
  saveJSON(CACHE_KEYS.support, state.support || {});
  localStorage.setItem(CACHE_KEYS.lastSync, String(Date.now()));
}
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("[D9] No pude registrar sw.js:", error);
  }
}
const onlyDigits = (v) => String(v || "").replace(/\D+/g, "");
const isTrue = (v) => ["true", "si", "sí", "1", "activo", "yes", "verdadero"].includes(String(v).trim().toLowerCase());
function esc(v){ return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }

function rowVal(row, ...keys) {
  if (!row) return "";
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [String(k).trim().toLowerCase(), v])
  );
  for (const key of keys) {
    const k = String(key).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(normalized, k) && normalized[k] != null) {
      return normalized[k];
    }
  }
  return "";
}

function isActiveAd(row) {
  const val = rowVal(row, "activo", "active");
  if (val === true || val === 1) return true;

  const s = String(val ?? "").trim().toLowerCase();
  return ["true", "si", "sí", "1", "activo", "yes"].includes(s);
}


function parseRowsByKey(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    const key = String(r.clave || "").trim();
    if (!key) return;
    out[key] = {
      valor: String(r.valor ?? "").trim(),
      tex1: String(r.tex1 ?? "").trim(),
      tex2: String(r.tex2 ?? "").trim(),
      tex3: String(r.tex3 ?? "").trim()
    };
  });
  return out;
}

function confText(key, fallback = "") {
  const row = state.config?.[key];
  if (row === null || row === undefined || row === "") return fallback;

  if (typeof row === "string") return row || fallback;
  if (typeof row === "number") return String(row);
  if (typeof row === "boolean") return String(row);

  if (typeof row === "object") {
    const value = row.valor ?? row.tex1 ?? row.texto ?? "";
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  return fallback;
}


function getCarouselDelay() {
  const raw = confText("carrusel", "");
  const n = Number(String(raw || "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return 5200;

  // Si cargás 4, lo interpreta como 4 segundos. Si cargás 4000, como 4000 ms.
  const ms = n < 100 ? n * 1000 : n;

  // Evita valores extremos por error de carga.
  return Math.max(1500, Math.min(ms, 20000));
}

function confParts(key) {
  const row = state.config?.[key];
  if (!row) return [];
  if (typeof row === "string") return row ? [row] : [];
  return [row.tex1, row.tex2, row.tex3].map(v => String(v || "").trim()).filter(Boolean);
}

function confColors(key) {
  const row = state.config?.[key];
  if (!row) return [];
  if (typeof row === "string") return row ? [row] : [];
  return [row.tex1, row.tex2, row.tex3].map(v => String(v || "").trim());
}

function buildColoredInline(parts, colors, fallback = "") {
  const cleanParts = (parts || []).filter(Boolean);
  if (!cleanParts.length) return esc(fallback);
  return cleanParts.map((part, i) => {
    const color = String(colors?.[i] || "").trim();
    const style = color ? ` style="color:${esc(color)}"` : "";
    return `<span${style}>${esc(part)}</span>`;
  }).join(" ");
}




function injectCategoryChipStylesD9() {
  if (document.getElementById("d9-category-chip-style")) return;
  const style = document.createElement("style");
  style.id = "d9-category-chip-style";
  style.textContent = `
#productModal.modal{
  align-items:center !important;
  justify-content:center !important;
  padding:6px 8px !important;
}

#productModal .product-modal-panel-d9{
  width:calc(100vw - 24px) !important;
  max-width:680px !important;
  height:calc(100dvh - 24px) !important;
  min-height:calc(100dvh - 24px) !important;
  max-height:calc(100dvh - 24px) !important;
  margin:0 auto !important;
  display:flex !important;
  flex-direction:column !important;
  overflow:hidden !important;
  border-radius:28px !important;
  padding:16px 16px 14px !important;
  background:#fff !important;
}

#productModal .modal-head-row{
  flex:0 0 auto !important;
  display:grid !important;
  grid-template-columns:1fr !important;
  align-items:start !important;
  gap:8px !important;
  margin:0 0 10px !important;
  position:relative !important;
}

#productModal .modal-head-row > div{
  min-width:0 !important;
  width:100% !important;
  padding:0 58px !important;
  text-align:center !important;
}

#productModal .modal-head-row h3{
  margin:0 0 8px !important;
  width:100% !important;
  text-align:center !important;
  font-size:25px !important;
  line-height:1.12 !important;
  font-weight:950 !important;
  letter-spacing:-.025em !important;
  color:#173454 !important;
}

#productModal .modal-head-row .ghost-x{
  position:absolute !important;
  top:0 !important;
  right:0 !important;
  z-index:8 !important;
}

#productModalHint.modal-text,
#productModalHint.small-gap{
  margin:0 !important;
  padding:0 !important;
  width:100% !important;
  color:inherit !important;
}

.modal-category-box-d9{
  width:100% !important;
  display:flex !important;
  flex-direction:column !important;
  gap:8px !important;
  margin:0 !important;
}

.modal-category-current-d9{
  width:100% !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:8px !important;
  text-align:center !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  color:#173454 !important;
}

.modal-category-current-d9 span{
  flex:0 0 auto !important;
  font-size:12px !important;
  font-weight:850 !important;
  letter-spacing:.04em !important;
  text-transform:uppercase !important;
  color:#6f8294 !important;
}

.modal-category-current-d9 strong{
  min-width:0 !important;
  max-width:55% !important;
  font-size:16px !important;
  line-height:1.1 !important;
  font-weight:950 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
}

.modal-category-button-d9{
  width:100% !important;
  max-width:none !important;
  min-height:46px !important;
  height:46px !important;
  border:1px solid rgba(36,137,190,.22) !important;
  background:#f5fbff !important;
  color:#173454 !important;
  border-radius:16px !important;
  font-size:16px !important;
  font-weight:950 !important;
  display:flex !important;
  justify-content:center !important;
  align-items:center !important;
  text-align:center !important;
  padding:0 16px !important;
  margin:0 !important;
  box-shadow:none !important;
}

#productModal #productSearch{
  flex:0 0 auto !important;
  margin:0 0 12px !important;
}

#productModal #productList{
  flex:1 1 auto !important;
  min-height:0 !important;
  max-height:none !important;
  overflow-y:auto !important;
  display:flex !important;
  flex-direction:column !important;
  justify-content:flex-start !important;
  align-content:flex-start !important;
  gap:12px !important;
  padding:0 0 92px !important;
  margin:0 !important;
}

#productModal #productList .product-item,
#productModal #productList .product-picker{
  flex:0 0 auto !important;
  min-height:96px !important;
  height:auto !important;
  max-height:126px !important;
  align-items:center !important;
}

#productModal #btnProductDone{
  flex:0 0 auto !important;
  margin:0 !important;
  border-radius:18px !important;
}
`;
  document.head.appendChild(style);
}



function injectProductModalMicroStylesD9() {
  if (document.getElementById("d9-product-modal-v8-style")) return;
  const style = document.createElement("style");
  style.id = "d9-product-modal-v8-style";
  style.textContent = `
    #productModal .modal-head-row h3,
    #productModal .modal-header h2,
    #productModal .modal-head h2,
    #productModal h2:first-child{
      white-space:nowrap !important;
      overflow:hidden !important;
      text-overflow:ellipsis !important;
      font-size:24px !important;
      line-height:1.12 !important;
    }
    @media (max-width: 360px){
      #productModal .modal-head-row h3,
      #productModal .modal-header h2,
      #productModal .modal-head h2,
      #productModal h2:first-child{
        font-size:22px !important;
      }
    }
    .modal-category-current-d9 strong{ max-width:72% !important; }
    #categoryModal.front-modal-d9,
    .modal.front-modal-d9{ z-index:999999 !important; }
    #categoryModal.front-modal-d9 .modal-card,
    #categoryModal.front-modal-d9 .modal-content,
    #categoryModal.front-modal-d9 .modal-box,
    .modal.front-modal-d9 .modal-card,
    .modal.front-modal-d9 .modal-content,
    .modal.front-modal-d9 .modal-box{ z-index:1000000 !important; }
  `;
  document.head.appendChild(style);
}



function injectInlineQtyStylesD9() {
  if (document.getElementById("d9-inline-qty-style")) return;
  const style = document.createElement("style");
  style.id = "d9-inline-qty-style";
  style.textContent = `

/* === D9 cantidad inline fix v11: selector tactil 75/25 === */
#productModal .product-picker{
  overflow:hidden !important;
}

#productModal .product-side{
  min-width:112px !important;
  max-width:none !important;
  align-self:stretch !important;
  display:flex !important;
  flex-direction:column !important;
  justify-content:center !important;
  align-items:center !important;
  gap:8px !important;
  padding-top:0 !important;
}

#productModal .product-side .product-price{
  width:100% !important;
  text-align:right !important;
  white-space:nowrap !important;
}

#productModal .qty-inline-d9{
  width:100% !important;
  display:grid !important;
  grid-template-columns:44px 44px !important;
  align-items:center !important;
  justify-content:center !important;
  justify-items:center !important;
  gap:8px !important;
  color:#6f8294 !important;
  white-space:nowrap !important;
  user-select:none !important;
  margin:0 !important;
  padding:0 !important;
  position:static !important;
}

#productModal .qty-inline-d9 strong{
  display:none !important;
}

#productModal .qty-inline-btn-d9{
  width:44px !important;
  height:44px !important;
  min-width:44px !important;
  max-width:44px !important;
  border-radius:13px !important;
  border:1px solid rgba(36,137,190,.30) !important;
  background:#ffffff !important;
  color:#173454 !important;
  font-size:28px !important;
  font-weight:950 !important;
  line-height:42px !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  padding:0 !important;
  margin:0 !important;
  box-shadow:0 3px 9px rgba(21,91,145,.14) !important;
  position:static !important;
  transform:none !important;
}

#productModal .qty-inline-btn-d9:active{
  transform:scale(.94) !important;
}
`;
  document.head.appendChild(style);
}



function bindInlineQtyCaptureD9() {
  if (window.__d9InlineQtyCaptureBound) return;
  window.__d9InlineQtyCaptureBound = true;

  let lastQtyTap = { id: "", action: "", time: 0 };

  const handleQty = (e) => {
    const qtyBtn = e.target.closest?.("[data-product-qty]");
    if (!qtyBtn) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

    const id = qtyBtn.dataset.id;
    const action = qtyBtn.dataset.productQty;
    if (!id || !action) return;

    const now = Date.now();
    if (
      lastQtyTap.id === id &&
      lastQtyTap.action === action &&
      now - lastQtyTap.time < 350
    ) {
      return;
    }

    lastQtyTap = { id, action, time: now };

    if (action === "plus") updateQty(id, 1);
    if (action === "minus") updateQty(id, -1);
  };

  // Usamos click en captura. Evitamos pointerup porque en mobile dispara doble junto con click.
  document.addEventListener("click", handleQty, true);

  document.addEventListener("keydown", (e) => {
    const qtyBtn = e.target.closest?.("[data-product-qty]");
    if (!qtyBtn) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    handleQty(e);
  }, true);
}



// Evita que al tocar el fondo de una card ya seleccionada (especialmente zona derecha de controles)
// se dispare el toggle/deselección. Solo los botones - y + modifican cantidad.
function bindSelectedProductNoToggleD9() {
  if (window.__d9SelectedProductNoToggleBound) return;
  window.__d9SelectedProductNoToggleBound = true;

  document.addEventListener("click", (e) => {
    const selectedCard = e.target.closest?.("#productModal .product-picker.is-selected");
    if (!selectedCard) return;

    // Los botones de cantidad y el valor editable tienen su propio handler.
    if (e.target.closest?.("[data-product-qty]")) return;
    if (e.target.closest?.("[data-mostrador-qty]")) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }, true);
}


function injectPriceListCleanStickyD9() {
  if (document.getElementById("d9-price-clean-sticky-v2")) return;
  const style = document.createElement("style");
  style.id = "d9-price-clean-sticky-v2";
  style.textContent = `
    #priceListInfo,
    .price-info{
      display:none !important;
      height:0 !important;
      margin:0 !important;
      padding:0 !important;
      overflow:hidden !important;
    }
    #view-prices .card.section-block{
      overflow:visible !important;
    }
    #view-prices .price-sticky-d9{
      position:sticky !important;
      top:86px !important;
      z-index:80 !important;
      background:rgba(255,255,255,.98) !important;
      backdrop-filter:blur(10px) !important;
      -webkit-backdrop-filter:blur(10px) !important;
      padding:0 0 10px !important;
      margin:0 0 12px !important;
      border-radius:0 0 20px 20px !important;
    }
    #view-prices .price-sticky-d9 #priceSearch{
      background:#fff !important;
    }
    #view-prices .history-head-d9{
      z-index:90 !important;
    }
  `;
  document.head.appendChild(style);
}



function injectOrderConfirmStylesD9() {
  if (document.getElementById("d9-order-confirm-style")) return;
  const style = document.createElement("style");
  style.id = "d9-order-confirm-style";
  style.textContent = `
    .preview-box.compact-preview{ display:none !important; }

    /* Modal y panel */
    #orderConfirmModal{
      align-items:center !important;
      justify-content:center !important;
      padding:8px !important;
    }
    #orderConfirmModal .order-confirm-panel-d9{
      width:calc(100vw - 24px) !important;
      max-width:680px !important;
      height:calc(100dvh - 28px) !important;
      max-height:calc(100dvh - 28px) !important;
      min-height:calc(100dvh - 28px) !important;
      margin:0 auto !important;
      display:flex !important;
      flex-direction:column !important;
      overflow:hidden !important;
      border-radius:28px !important;
    }

    /* Header */
    #orderConfirmModal .modal-head-row{
      flex:0 0 auto !important;
      position:relative !important;
      display:flex !important;
      justify-content:center !important;
      text-align:center !important;
      padding:18px 64px 10px !important;
    }
    #orderConfirmModal .modal-head-row > div{ width:100% !important; }
    #orderConfirmModal .modal-head-row h3{
      margin:0 !important;
      font-size:25px !important;
      line-height:1.1 !important;
      font-weight:950 !important;
      color:#173454 !important;
    }
    #orderConfirmModal .modal-head-row .modal-text{
      margin:6px 0 0 !important;
      font-size:14px !important;
      line-height:1.25 !important;
    }
    #orderConfirmModal .modal-head-row .ghost-x{
      position:absolute !important;
      top:14px !important;
      right:18px !important;
    }

    /* Contenido scrolleable */
    #orderConfirmContent.order-confirm-content-d9{
      flex:1 1 auto !important;
      min-height:0 !important;
      overflow-y:auto !important;
      padding-bottom:12px !important;
    }

    /* Botones fijos abajo */
    #orderConfirmModal .confirm-actions-d9{
      flex:0 0 auto !important;
      margin-top:auto !important;
      position:sticky !important;
      bottom:0 !important;
      z-index:30 !important;
      background:#fff !important;
      padding:10px 0 6px !important;
      display:flex !important;
      gap:10px !important;
    }
    #orderConfirmModal .confirm-actions-d9 button{
      flex:1 1 0 !important;
      min-width:0 !important;
    }

    /* Ocultar grid viejo */
    #orderConfirmModal .confirm-info-grid-d9{ display:none !important; }

    /* Card cliente */
    #orderConfirmModal .confirm-client-card-d9{
      width:100% !important;
      box-sizing:border-box !important;
      border:1px solid rgba(23,52,84,.10) !important;
      background:#f7fbfe !important;
      border-radius:16px !important;
      padding:12px 14px !important;
      margin:0 !important;
    }
    #orderConfirmModal .confirm-client-card-d9 span{
      display:block !important;font-size:12px !important;font-weight:850 !important;
      color:#6f8294 !important;line-height:1.1 !important;
    }
    #orderConfirmModal .confirm-client-card-d9 strong{
      display:block !important;font-size:18px !important;line-height:1.15 !important;
      color:#173454 !important;white-space:nowrap !important;overflow:hidden !important;
      text-overflow:ellipsis !important;margin-top:4px !important;
    }
    #orderConfirmModal .confirm-client-card-d9 small{
      display:block !important;font-size:13px !important;color:#6f8294 !important;
      white-space:nowrap !important;overflow:hidden !important;
      text-overflow:ellipsis !important;margin-top:4px !important;
    }

    /* Fila de métricas */
    #orderConfirmModal .confirm-metrics-row-d9{
      display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;
      gap:7px !important;margin:0 !important;width:100% !important;box-sizing:border-box !important;
    }
    #orderConfirmModal .confirm-metric-card-d9{
      flex:1 1 0 !important;min-width:0 !important;height:72px !important;
      box-sizing:border-box !important;border:1px solid rgba(23,52,84,.10) !important;
      background:#f7fbfe !important;border-radius:15px !important;padding:9px 10px !important;
    }
    #orderConfirmModal .confirm-metric-card-d9.total{ flex:1.5 1 0 !important; }
    #orderConfirmModal .confirm-metric-card-d9 span{
      display:block !important;font-size:10px !important;font-weight:850 !important;
      color:#6f8294 !important;line-height:1 !important;white-space:nowrap !important;
      overflow:hidden !important;text-overflow:ellipsis !important;text-align:right !important;
    }
    #orderConfirmModal .confirm-metric-card-d9 strong{
      display:block !important;font-size:16px !important;line-height:1.05 !important;
      color:#173454 !important;font-weight:950 !important;white-space:nowrap !important;
      overflow:hidden !important;text-overflow:ellipsis !important;
      margin-top:8px !important;text-align:right !important;
    }
    #orderConfirmModal .confirm-metric-card-d9.total strong{ font-size:17px !important; }
  `;
  document.head.appendChild(style);
}



function hasActiveOrderDraftD9() {
  return Boolean(
    state.currentView === "order" ||
    state.selectedClient ||
    state.guestClientDraft ||
    state.selectedCategory ||
    (Array.isArray(state.cart) && state.cart.length)
  );
}


function snapshotOrderDraftD9() {
  return {
    selectedClient: state.selectedClient,
    guestClientDraft: state.guestClientDraft,
    selectedCategory: state.selectedCategory,
    cart: Array.isArray(state.cart) ? state.cart.slice() : [],
    activePriceList: state.activePriceList,
    manualPriceOverride: state.manualPriceOverride,
    currentView: state.currentView
  };
}

function restoreOrderDraftD9(snap) {
  if (!snap) return;
  state.selectedClient = snap.selectedClient;
  state.guestClientDraft = snap.guestClientDraft;
  state.selectedCategory = snap.selectedCategory;
  state.cart = Array.isArray(snap.cart) ? snap.cart.slice() : [];
  state.activePriceList = snap.activePriceList;
  state.manualPriceOverride = snap.manualPriceOverride;
  state.currentView = snap.currentView || state.currentView;
}

function safeRenderPreservingOrderDraftD9() {
  if (!hasActiveOrderDraftD9()) {
    renderAll();
    return;
  }

  const snap = snapshotOrderDraftD9();
  renderAll();
  restoreOrderDraftD9(snap);

  renderSellerBadge();
  renderPendingBadge();
  renderNetwork();
  renderQuickLabels();
  renderSelectedClient();
  renderCart();
}


function refreshPendingOnlyD9() {
  renderPendingBadge();
  renderNetwork();
}

function safeRenderAfterBackgroundTaskD9() {
  safeRenderPreservingOrderDraftD9();
}






function enableTickerTouchD9() {
  if (window.__d9TickerTouchEnabledV2) return;
  window.__d9TickerTouchEnabledV2 = true;

  const bind = () => {
    const wrap =
      document.querySelector(".led-marquee-wrap-vnext") ||
      document.querySelector(".ticker-wrap") ||
      document.querySelector(".ticker-container");

    const track =
      document.querySelector(".ticker-track") ||
      document.querySelector(".led-marquee-vnext") ||
      document.querySelector("#tickerTrack");

    if (!wrap || !track || track.dataset.touchBoundD9 === "v2") return;
    track.dataset.touchBoundD9 = "v2";

    let dragging = false;
    let startX = 0;
    let baseOffset = 0;
    let offsetPx = 0;
    let resumeTimer = null;
    const speedPxPerSecond = 45;

    const applyOffset = () => {
      const delay = -(offsetPx / speedPxPerSecond);
      track.style.animationDelay = `${delay}s`;
      track.style.webkitAnimationDelay = `${delay}s`;
    };

    const pause = () => {
      clearTimeout(resumeTimer);
      track.style.animationPlayState = "paused";
      track.style.webkitAnimationPlayState = "paused";
    };

    const play = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        track.style.animationPlayState = "running";
        track.style.webkitAnimationPlayState = "running";
      }, 900);
    };

    const onPointerDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      dragging = true;
      startX = e.clientX;
      baseOffset = offsetPx;
      pause();

      try { wrap.setPointerCapture?.(e.pointerId); } catch (_) {}
    };

    const onPointerMove = (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      // arrastrar a la derecha retrocede; izquierda avanza
      offsetPx = Math.max(0, baseOffset - dx);
      applyOffset();

      e.preventDefault();
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      try { wrap.releasePointerCapture?.(e.pointerId); } catch (_) {}
      play();
    };

    wrap.addEventListener("pointerdown", onPointerDown, { passive: true });
    wrap.addEventListener("pointermove", onPointerMove, { passive: false });
    wrap.addEventListener("pointerup", onPointerUp, { passive: true });
    wrap.addEventListener("pointercancel", onPointerUp, { passive: true });
    wrap.addEventListener("pointerleave", onPointerUp, { passive: true });
  };

  bind();

  const observer = new MutationObserver(() => bind());
  observer.observe(document.body, { childList: true, subtree: true });
}


function renderDualButton(btn, title, sub = "") {
  if (!btn) return;
  const titleEl = btn.querySelector(".title-group-vnext strong, .home-btn-title");
  const subEl = btn.querySelector(".title-group-vnext small, .home-btn-sub");
  if (titleEl || subEl) {
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;
    return;
  }
  btn.innerHTML = `<span class="home-btn-title">${esc(title)}</span><span class="home-btn-sub">${esc(sub)}</span>`;
}

function setButtonBusy(btn, busy, busyLabel = "Procesando...", idleLabel = "", busySub = "") {
  if (!btn) return;
  const dual = btn.classList.contains("home-btn");

  if (!btn.dataset.idleTitle) btn.dataset.idleTitle = btn.dataset.title || btn.querySelector(".home-btn-title")?.textContent?.trim() || idleLabel || btn.textContent.trim();
  if (!btn.dataset.idleSub) btn.dataset.idleSub = btn.dataset.sub || btn.querySelector(".home-btn-sub")?.textContent?.trim() || "";
  if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.dataset.title || idleLabel || btn.textContent.trim();

  if (busy) {
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.setAttribute("aria-busy", "true");
    if (dual) renderDualButton(btn, busyLabel, busySub || "Esperá un momento");
    else btn.textContent = busyLabel;
    return;
  }

  btn.disabled = false;
  btn.classList.remove("is-busy");
  btn.setAttribute("aria-busy", "false");
  if (dual) renderDualButton(btn, btn.dataset.idleTitle || idleLabel || "", btn.dataset.idleSub || "");
  else btn.textContent = btn.dataset.idleLabel || idleLabel || btn.textContent;
}



function pulseSuccess(btn, label = "Listo", sublabel = "") {
  if (!btn) return;

  // D9 v1.4.9: las tarjetas ricas del Home NO deben convertirse en texto plano.
  // Eso dejaba “Pendientes y en espera” pelado al salir/volver de pantallas o al guardar offline.
  const isPendingHomeCard = btn.id === "btnSyncPending";
  const dual = btn.classList.contains("home-btn");
  const richCard = isPendingHomeCard || btn.classList.contains("action-card-vnext") || !!btn.querySelector(".action-head-vnext");

  const idleTitle = btn.dataset.idleTitle || btn.dataset.title || btn.querySelector(".title-group-vnext strong")?.textContent?.trim() || btn.textContent.trim();
  const idleSub = btn.dataset.idleSub || btn.dataset.sub || btn.querySelector(".title-group-vnext small")?.textContent?.trim() || "";
  const idle = btn.dataset.idleLabel || btn.dataset.title || btn.textContent.trim();

  btn.classList.add("is-success");

  if (isPendingHomeCard) {
    renderPendingBadge();
  } else if (dual) {
    renderDualButton(btn, label, sublabel || idleSub || "Todo sincronizado");
  } else if (!richCard) {
    btn.textContent = label;
  }

  setTimeout(() => {
    btn.classList.remove("is-success");
    if (isPendingHomeCard) {
      renderPendingBadge();
    } else if (dual) {
      renderDualButton(btn, idleTitle, idleSub);
    } else if (!richCard) {
      btn.textContent = idle;
    }
  }, 1400);
}




function normalizarClaveConfigD9(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function confTextLooseD9(...keys) {
  const wanted = keys.map(normalizarClaveConfigD9);

  for (const key of keys) {
    const direct = confText(key, "");
    if (direct) return direct;
  }

  const config = state.config || {};
  for (const [rawKey, rawValue] of Object.entries(config)) {
    const normalizedKey = normalizarClaveConfigD9(rawKey);
    if (!wanted.includes(normalizedKey)) continue;

    if (typeof rawValue === "string" || typeof rawValue === "number") {
      const value = String(rawValue || "").trim();
      if (value) return value;
    }

    if (rawValue && typeof rawValue === "object") {
      const value = String(rawValue.valor || rawValue.tex1 || rawValue.texto || "").trim();
      if (value) return value;
    }
  }

  return "";
}

function getDefaultWhatsAppD9() {
  return confTextLooseD9(
    "telefono_wa",
    "telefono wa",
    "telefono-wa",
    "telefono",
    "wasapp",
    "whatsapp",
    "watsapp"
  );
}


function openWhatsApp(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return false;
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
  return true;
}



async function loadAllData() {
  const r = await fetch(BOOTSTRAP_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`Bootstrap falló: ${r.status}`);

  const data = await r.json();
  if (!data.ok) throw new Error("Bootstrap retornó ok:false");

  const sellers  = Array.isArray(data.usuarios)   ? data.usuarios   : [];
  const clients  = Array.isArray(data.clientes)   ? data.clientes   : [];
  const products = Array.isArray(data.productos)  ? data.productos  : [];
  const ads      = Array.isArray(data.publicidad) ? data.publicidad : [];

  state.config = data.config || {};
  state.support = data.soporte || {};

  state.users = sellers.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    usuario: String(r.usuario || "").trim().toLowerCase(),
    nombre: String(r.nombre || "").trim(),
    clave: String(r.clave || "").trim(),
    rol: String(r.rol || "cliente").trim().toLowerCase(),
    lista_1: String(r.lista_1 || "").trim().toLowerCase(),
    cliente_id: String(r.cliente_id || "").trim(),
    wasap_report: String(r.wasap_report || "").trim()
  }));

  state.clients = clients.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    telefono: String(r.telefono || "").trim(),
    direccion: String(r.direccion || "").trim(),
    ciudad: String(r.ciudad || r.localidad || "").trim(),
    lista_1: String(r.lista_1 || "").trim().toLowerCase()
  }));

  state.products = products.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    categoria: String(r.categoria || "Sin categoría").trim() || "Sin categoría",
    precios: {
      lista_1: parseD9Number(r.lista_1 || r.precio || 0),
      lista_2: parseD9Number(r.lista_2 || 0),
      lista_3: parseD9Number(r.lista_3 || 0)
    }
  }));

  state.ads = ads.filter(isActiveAd);
  state.hasLoadedData = true;


}


function showView(name, pushHistory = true) {
  state.currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add("active");
  if (name === "home" || name === "pending") schedulePendingHomeRefreshD9();
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pushHistory && name !== "home" && window.history && window.history.pushState) {
    history.pushState({ view: name }, "", location.href);
  }
}

function openModal(name, pushHistory = true) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (pushHistory && window.history && window.history.pushState) {
    history.pushState({ modal: name, view: state.currentView || "home" }, "", location.href);
  }
}

function closeModal(name) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
  modal.classList.remove("front-modal-d9");
  modal.style.zIndex = "";
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  if (name === "product") {
    renderQuickLabels();
    renderCart();
  }
  if (name === "category") {
    renderQuickLabels();
    renderProducts();
  }
  if (name === "occasionalClient") {
    renderQuickLabels();
    renderSelectedClient();
  }
}

function getOpenModalName() {
  const modal = document.querySelector(".modal:not(.hidden)");
  if (!modal || !modal.id) return "";
  return modal.id.replace(/Modal$/, "");
}

function closeOpenModalForBack() {
  const name = getOpenModalName();
  if (!name) return false;
  closeModal(name);
  return true;
}

function setupAndroidBackButton() {
  if (!window.history || !window.history.pushState) return;

  history.replaceState({ view: state.currentView || "home" }, "", location.href);

  window.addEventListener("popstate", () => {
    if (closeOpenModalForBack()) return;

    if (state.currentView && state.currentView !== "home") {
      showView("home", false);
      return;
    }
  });
}



function setAppUpdateAvailableD9(flag) {
  isAppUpdateAvailableD9 = !!flag;
  updateSupportChip();
}

async function checkAppVersionD9() {
  try {
    const res = await fetch(`./app.js?vcheck=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;

    const txt = await res.text();
    const match = txt.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/);
    const latest = match ? String(match[1] || "").trim() : "";

    if (latest && latest !== APP_VERSION) {
      setAppUpdateAvailableD9(true);
    } else {
      setAppUpdateAvailableD9(false);
    }
  } catch (err) {
    console.warn("[D9] No se pudo verificar versión nueva:", err);
  }
}

function reloadAppForUpdateD9() {
  window.location.href = `${location.pathname}?v=${Date.now()}`;
}

function updateSupportChip() {
  const chipEl = $("#btnPancko");
  if (!chipEl) return;

  chipEl.classList.toggle("version-alert-d9", !!isAppUpdateAvailableD9);

  if (isAppUpdateAvailableD9) {
    chipEl.textContent = "⚠️ Actualizar";
    chipEl.title = "Nueva versión disponible";
    return;
  }

  chipEl.title = "Sincronizar datos";
  chipEl.textContent = "↻ Sync";
}

function renderTop() {
  const titleEl = $("#appTitle");
  const companyEl = $("#empresaLabel");

  if (titleEl) {
    titleEl.innerHTML = buildColoredInline(
      confParts("titulo"),
      confColors("titulo_color"),
      "Distribuidora 9"
    );
  }

  if (companyEl) {
    companyEl.innerHTML = buildColoredInline(
      confParts("subtitulo"),
      confColors("subtitulo_color"),
      "Gestor de pedidos"
    );
  }

  updateSupportChip();
}

function renderNetwork() {
  const el = $("#networkStatus");
  if (!el) return;
  el.classList.remove("online", "offline", "muted");
  if (navigator.onLine) {
    el.textContent = confText("estado_label_online", "Online");
    el.classList.add("online");
  } else {
    el.textContent = confText("estado_label_offline", "Offline");
    el.classList.add("offline");
  }
}

function getActiveIdentityD9() {
  if (state.seller) {
    const rolRaw = String(state.seller.rol || "").trim().toLowerCase();
    const rol = rolRaw === "cliente" ? "Cliente" : rolRaw === "vendedor" ? "Vendedor" : "Usuario";
    return {
      name: state.seller.nombre || "Usuario",
      role: rol,
      kind: rolRaw || "usuario",
      muted: false
    };
  }

  if (state.guestClientDraft?.nombre_real || state.guestClientDraft?.nombre) {
    return {
      name: state.guestClientDraft.nombre_real || state.guestClientDraft.nombre || "Invitado",
      role: "Invitado",
      kind: "invitado",
      muted: false
    };
  }

  return {
    name: "Sin usuario",
    role: "",
    kind: "none",
    muted: true
  };
}

function renderIdentityNameD9(el, name) {
  el.textContent = "";
  const text = document.createElement("span");
  text.className = "identity-name-d9";
  text.textContent = name;
  el.appendChild(text);
}

function renderSellerBadge() {
  const badge = $("#sellerBadge");
  if (!badge) return;

  let nameEl = badge.querySelector(".seller-name");
  if (!nameEl) {
    badge.textContent = "";
    nameEl = document.createElement("span");
    nameEl.className = "seller-name";
    badge.appendChild(nameEl);
  }

  let roleEl = badge.querySelector(".identity-role-d9");
  if (!roleEl) {
    roleEl = document.createElement("small");
    roleEl.className = "identity-role-d9";
    badge.appendChild(roleEl);
  }

  const identity = getActiveIdentityD9();

  badge.classList.toggle("muted", !!identity.muted);
  badge.classList.remove("identity-vendedor-d9", "identity-cliente-d9", "identity-invitado-d9", "identity-none-d9");
  badge.classList.add(`identity-${identity.kind || "none"}-d9`);
  badge.setAttribute("role", "button");
  badge.title = "Ver usuario";

  renderIdentityNameD9(nameEl, identity.name);
  roleEl.textContent = identity.role ? `👥 ${identity.role}` : "";
}


function ensurePendingHomeCardD9(card) {
  if (!card) return;
  const needsRebuild = !card.querySelector(".icon-wrap-vnext") || !card.querySelector("#pendingInfoTitle") || !card.querySelector("#pendingInfoText") || !card.querySelector(".pending-count-vnext");
  if (!needsRebuild) return;
  card.innerHTML = `
    <span class="action-head-vnext">
      <span class="icon-wrap-vnext warm">📋</span>
      <span class="title-group-vnext">
        <strong id="pendingInfoTitle">Pendientes y en espera</strong>
        <small id="pendingInfoText">Sin pendientes ni borradores</small>
      </span>
    </span>
    <span class="pending-count-vnext hidden">0</span>
  `;
}

function renderPendingBadge() {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  const drafts = readJSON(STORAGE_KEYS.drafts, []);
  const pendingCount = pending.length;
  const draftCount = drafts.length;
  const totalCount = pendingCount + draftCount;
  const el = $("#pendingBadge");
  const card = $("#btnSyncPending");
  ensurePendingHomeCardD9(card);
  const cardCount = card?.querySelector(".pending-count-vnext");
  const cardTitle = card?.querySelector("#pendingInfoTitle");
  const cardSub = card?.querySelector("#pendingInfoText");

  if (card) {
    card.classList.toggle("has-pending", totalCount > 0);
    card.classList.toggle("has-pending-real", pendingCount > 0);
    card.classList.toggle("has-drafts-only", !pendingCount && draftCount > 0);
    if (!pendingCount) card.classList.remove("syncing");
  }

  if (cardCount) {
    const visibleCount = pendingCount || draftCount;
    if (!visibleCount) {
      cardCount.classList.add("hidden");
      cardCount.textContent = "0";
      cardCount.title = "";
    } else {
      cardCount.classList.remove("hidden");
      cardCount.textContent = String(visibleCount);
      cardCount.title = pendingCount ? `${pendingCount} pedido${pendingCount === 1 ? "" : "s"} sin cargar en PC` : `${draftCount} borrador${draftCount === 1 ? "" : "es"}`;
    }
  }

  if (cardTitle) {
    cardTitle.textContent = "Pendientes y en espera";
  }
  if (cardSub) {
    if (pendingCount && draftCount) {
      cardSub.textContent = `${pendingCount} pedido${pendingCount === 1 ? "" : "s"} sin cargar en PC · ${draftCount} borrador${draftCount === 1 ? "" : "es"}`;
    } else if (pendingCount) {
      cardSub.textContent = `${pendingCount} pedido${pendingCount === 1 ? "" : "s"} sin cargar en PC`;
    } else if (draftCount) {
      cardSub.textContent = `${draftCount} borrador${draftCount === 1 ? "" : "es"} en espera`;
    } else {
      cardSub.textContent = "Sin pendientes ni borradores";
    }
  }

  if (!el) return;
  if (!totalCount) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = String(totalCount);
}

function refreshPendingUiD9() {
  renderPendingBadge();
  if (state.currentView === "pending") renderPendingAndDraftsD9();
}

function schedulePendingHomeRefreshD9() {
  renderPendingBadge();
  requestAnimationFrame(() => renderPendingBadge());
  setTimeout(() => renderPendingBadge(), 250);
}

function getBannerRows() {
  return (Array.isArray(state.ads) ? state.ads : [])
    .slice()
    .sort((a, b) => Number(rowVal(a, "orden", "id") || 0) - Number(rowVal(b, "orden", "id") || 0));
}

function bannerSignature(rows) {
  return rows.map((r) => [
    rowVal(r, "orden", "id"),
    rowVal(r, "imagen_url_full", "imagen_full"),
    rowVal(r, "imagen_url", "imagen", "link_imagen"),
    rowVal(r, "titulo"),
    rowVal(r, "texto_1", "texto1", "linea1"),
    rowVal(r, "texto_2", "texto2", "linea2")
  ].join("|")).join("||");
}

function preloadBannerImages(rows) {
  rows.forEach((row) => {
    const src = String(rowVal(row, "imagen_url_full", "imagen_full") || rowVal(row, "imagen_url", "imagen", "link_imagen") || "").trim();
    if (!src) return;
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  });
}

function stopBannerCarousel() {
  if (bannerCarousel.timer) {
    clearInterval(bannerCarousel.timer);
    bannerCarousel.timer = null;
  }
}

function startBannerCarousel(rows) {
  stopBannerCarousel();
  bannerCarousel.delay = getCarouselDelay();
  if (!rows || rows.length <= 1) return;
  bannerCarousel.timer = setInterval(() => {
    if (document.hidden || state.currentView !== "home") return;
    const nextIndex = (bannerCarousel.index + 1) % rows.length;
    renderBannerWithTransition(nextIndex, 1);
  }, bannerCarousel.delay);
}

function goBannerSlide(index) {
  const rows = getBannerRows();
  if (!rows.length) return;
  const newIndex = Math.max(0, Math.min(Number(index) || 0, rows.length - 1));
  const direction = newIndex >= bannerCarousel.index ? 1 : -1;
  renderBannerWithTransition(newIndex, direction);
  startBannerCarousel(rows);
}

function renderBannerWithTransition(newIndex, direction = 1) {
  const rows = getBannerRows();
  const box = $("#bannerWrap");
  if (!rows.length || !box || rows.length <= 1 || bannerCarousel.isAnimating) {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, Math.max(rows.length - 1, 0)));
    renderBanner(true);
    return;
  }

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, rows.length - 1));
    renderBanner(true);
    return;
  }

  bannerCarousel.isAnimating = true;
  box.style.setProperty("--banner-dir", direction >= 0 ? "1" : "-1");
  box.classList.remove("banner-transition-in");
  box.classList.add("banner-transition-out");

  setTimeout(() => {
    bannerCarousel.index = Math.max(0, Math.min(Number(newIndex) || 0, rows.length - 1));
    renderBanner(true);
    box.classList.remove("banner-transition-out");
    box.classList.add("banner-transition-in");

    setTimeout(() => {
      box.classList.remove("banner-transition-in");
      bannerCarousel.isAnimating = false;
    }, 560);
  }, 300);
}

function renderBanner(skipTimerReset = false) {
  const box = $("#bannerWrap");
  if (isMostradorD9()) { if (box) { box.classList.add("hidden"); box.innerHTML = ""; } return; }
  if (!box) return;

  const rows = getBannerRows();
  const sig = bannerSignature(rows);

  if (sig !== bannerCarousel.signature) {
    bannerCarousel.signature = sig;
    bannerCarousel.index = 0;
    preloadBannerImages(rows);
  }

  if (!rows.length) {
    stopBannerCarousel();
    box.classList.add("hidden");
    box.classList.remove("banner-mode-full", "banner-mode-product", "banner-carousel-d9");
    box.innerHTML = "";
    return;
  }

  if (bannerCarousel.index >= rows.length) bannerCarousel.index = 0;
  const first = rows[bannerCarousel.index];

  const tag = String(rowVal(first, "texto", "tag") || "").trim();
  const titulo = String(rowVal(first, "titulo") || tag || "Publicidad").trim();
  const linea1 = String(rowVal(first, "texto_1", "texto1", "linea1") || "").trim();
  const linea2 = String(rowVal(first, "texto_2", "texto2", "linea2") || "").trim();
  const imgProducto = String(rowVal(first, "imagen_url", "imagen", "link_imagen") || "").trim();
  const imgFull = String(rowVal(first, "imagen_url_full", "imagen_full") || "").trim();
  const link = String(rowVal(first, "link_url", "link") || "#").trim() || "#";
  const hasLink = link && link !== "#";
  const dotsHtml = "";

  box.classList.remove("hidden");
  box.classList.add("banner-carousel-d9");

  if (imgFull) {
    box.classList.add("banner-mode-full");
    box.classList.remove("banner-mode-product");
    box.innerHTML = `
      <a class="banner-full-d9" href="${esc(link)}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ""}>
        <img class="banner-full-img-d9" src="${esc(imgFull)}" alt="${esc(titulo || 'Publicidad')}" loading="eager">
      </a>
      ${dotsHtml}`;
    if (!skipTimerReset) startBannerCarousel(rows);
    return;
  }

  const textHtml = [
    tag ? `<div class="banner-kicker-vnext">${esc(tag)}</div>` : "",
    titulo ? `<div class="banner-title-vnext">${esc(titulo)}</div>` : "",
    linea1 ? `<div class="banner-line-vnext">${esc(linea1)}</div>` : "",
    linea2 ? `<div class="banner-line-vnext">${esc(linea2)}</div>` : ""
  ].filter(Boolean).join("");

  box.classList.add("banner-mode-product");
  box.classList.remove("banner-mode-full");
  box.innerHTML = `
    <a class="banner-product-d9" href="${esc(link)}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ""}>
      <div class="banner-copy-d9">
        ${textHtml || `<div class="banner-title-vnext">Publicidad</div>`}
      </div>
      <div class="banner-art-d9">
        ${imgProducto ? `<img class="banner-thumb-d9" src="${esc(imgProducto)}" alt="${esc(titulo || 'Publicidad')}" loading="eager">` : `<div class="banner-thumb-d9 empty"></div>`}
      </div>
    </a>
    ${dotsHtml}`;

  if (!skipTimerReset) startBannerCarousel(rows);
}

function renderTicker(){
  const el = document.getElementById("ledTicker");
  if(!el) return;

  const texts = confParts("ticker_texto");
  const colors = confColors("ticker_color");

  const parts = texts.map((t,i)=>({
    t,
    c: colors[i] || "#4dabf7"
  })).filter(p => p.t);

  if(!parts.length) return;

  const one = parts.map((p,i)=>
    `<span style="color:${p.c}">${p.t}</span>` +
    (i < parts.length - 1 ? `<span class="ticker-sep"> • </span>` : "")
  ).join("");

  el.innerHTML = `
    <div class="ticker-track" id="tickerTrack">
      <div class="ticker-block" id="tickerBlock">${one}</div>
      <div class="ticker-gap"></div>
      <div class="ticker-block">${one}</div>
    </div>
  `;

  requestAnimationFrame(() => {
    const block = document.getElementById("tickerBlock");
    const track = document.getElementById("tickerTrack");
    if(!block || !track) return;

    const distance = block.scrollWidth + 40;
    const duration = Math.max(22, Math.round(distance / 30));

    track.style.setProperty("--move", distance + "px");
    track.style.setProperty("--time", duration + "s");
  });
}


function renderSupport() {
  const s = state.support || {};
  updateSupportChip();

  const nombre = esc(s.nombre || "M.J.S. APPs");
  const whatsappValue = s.whatsapp ? esc(s.whatsapp) : "-";
  const whatsappHref = s.whatsapp ? `https://wa.me/${onlyDigits(s.whatsapp)}` : "";
  const emailValue = s.email ? esc(s.email) : "-";
  const webValue = s.web ? esc(s.web) : "-";
  const webHref = s.web ? esc(s.web) : "";

  $("#supportBox").innerHTML = `
    <div class="support-pro-card-d9">
      <div class="support-pro-head-d9">
        <div class="support-pro-avatar-d9">🛠️</div>
        <div>
          <div class="support-pro-kicker-d9">Soporte técnico</div>
          <strong>${nombre}</strong>
          <p>Contacto y asistencia para el uso de la app.</p>
        </div>
      </div>

      <div class="support-pro-list-d9">
        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">📱</div>
          <div>
            <span>WhatsApp</span>
            ${whatsappHref ? `<a href="${whatsappHref}" target="_blank" rel="noopener">${whatsappValue}</a>` : `<strong>${whatsappValue}</strong>`}
          </div>
        </div>

        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">✉️</div>
          <div>
            <span>Email</span>
            ${s.email ? `<a href="mailto:${emailValue}">${emailValue}</a>` : `<strong>${emailValue}</strong>`}
          </div>
        </div>

        <div class="support-pro-item-d9">
          <div class="support-pro-icon-d9">🌐</div>
          <div>
            <span>Web</span>
            ${webHref ? `<a href="${webHref}" target="_blank" rel="noopener">${webValue}</a>` : `<strong>${webValue}</strong>`}
          </div>
        </div>
      </div>
    </div>`;
  // append version info (robusto)
  const s2 = state.support || {};
  if (s2.version || s2.version_fecha) {
    const v = document.createElement("div");
    v.className = "support-version-d9";
    v.innerHTML = `
      ${s2.version ? `<div>Versión ${esc(s2.version)}</div>` : ``}
      ${s2.version_fecha ? `<div>${esc(s2.version_fecha)}</div>` : ``}
    `;
    $("#supportBox").appendChild(v);
  }

}

function syncSessionUI() {
  const btn = $("#btnChangeSeller");
  if (!btn) return;
  if (state.seller) {
    renderDualButton(btn, "Usuario", "Sesión actual y acceso");
    btn.dataset.title = "Usuario";
    btn.dataset.sub = "Sesión actual y acceso";
  } else {
    renderDualButton(btn, "Ingresar", "Acceder con usuario y clave");
    btn.dataset.title = "Ingresar";
    btn.dataset.sub = "Acceder con usuario y clave";
  }

  updateSupportChip();
}

function applyUserContext() {
  if (!state.seller) {
    state.activePriceList = "lista_1";
    if (state.guestClientDraft && !state.selectedClient) state.selectedClient = state.guestClientDraft;
    return;
  }
  if (state.seller.rol === "cliente") {
    const byId = state.seller.cliente_id ? state.clients.find(c => String(c.id) === String(state.seller.cliente_id)) : null;
    const byName = !byId ? state.clients.find(c => c.nombre.trim().toLowerCase() === state.seller.nombre.trim().toLowerCase()) : null;
    const matched = byId || byName;
    state.selectedClient = matched || {
      id: state.seller.cliente_id || state.seller.id,
      nombre: state.seller.nombre,
      telefono: "",
      direccion: "",
      lista_1: state.seller.lista_1 || "lista_1"
    };
    state.activePriceList = state.selectedClient.lista_1 || state.seller.lista_1 || "lista_1";
  } else {
    state.selectedClient = null;
    state.activePriceList = state.activePriceList || "lista_1";
  }
}

function openLogin(force = false) {
  $("#sellerUser").value = "";
  $("#sellerPass").value = "";
  $("#btnLogout").classList.toggle("hidden", !state.seller);
  openModal("login");
  $("#btnCloseLogin").classList.toggle("hidden", force);
}

function closeLogin() {
  closeModal("login");
}



function onlyDigitsText(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function isD9StandaloneMode() {
  return !!(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

function setupInstallPromptD9() {
  if (d9InstallSetupDone) return;
  d9InstallSetupDone = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    d9DeferredInstallPrompt = event;
    d9InstallPromptReady = true;
    refreshInstallCardD9();
    console.log("[D9] Instalación PWA disponible.");
  });

  window.addEventListener("appinstalled", () => {
    d9DeferredInstallPrompt = null;
    d9InstallPromptReady = false;
    try { localStorage.setItem("d9_installed_at", new Date().toISOString()); } catch (_) {}
    refreshInstallCardD9();
    if (typeof toast === "function") toast("App instalada.");
    console.log("[D9] App instalada.");
  });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest?.("#btnInstallAppD9");
    if (!btn) return;
    event.preventDefault();
    installAppD9();
  });
}

async function installAppD9() {
  if (isD9StandaloneMode()) {
    if (typeof toast === "function") toast("La app ya está instalada.");
    refreshInstallCardD9();
    return;
  }

  if (!d9DeferredInstallPrompt) {
    if (typeof toast === "function") toast("Chrome todavía no habilitó la instalación.");
    refreshInstallCardD9();
    return;
  }

  const promptEvent = d9DeferredInstallPrompt;
  d9DeferredInstallPrompt = null;
  d9InstallPromptReady = false;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    console.log("[D9] Resultado instalación PWA:", choice?.outcome || choice);
  } catch (err) {
    console.warn("[D9] No se pudo abrir el prompt de instalación:", err);
    if (typeof toast === "function") toast("No se pudo abrir la instalación.");
  } finally {
    refreshInstallCardD9();
  }
}

function buildInstallAppCardD9() {
  const installed = isD9StandaloneMode();
  const ready = !!d9DeferredInstallPrompt && d9InstallPromptReady && !installed;

  if (installed) {
    return `
      <div id="companyInstallBoxD9" class="company-install-d9 is-installed">
        <div>
          <span>Instalación</span>
          <strong>✅ App instalada</strong>
          <small>D9 ya está lista para abrir desde el inicio del celular.</small>
        </div>
      </div>
    `;
  }

  return `
    <div id="companyInstallBoxD9" class="company-install-d9 ${ready ? "is-ready" : "is-waiting"}">
      <div>
        <span>Instalación</span>
        <strong>${ready ? "Instalar D9 en este celular" : "Instalar en el celular"}</strong>
        <small>${ready ? "Crea el ícono de la app y abre D9 como aplicación." : "Si Chrome no habilita el botón, usá menú ⋮ → Agregar a pantalla principal."}</small>
      </div>
      <button id="btnInstallAppD9" type="button" class="company-install-btn-d9">
        ${ready ? "📲 Instalar app" : "📲 Revisar instalación"}
      </button>
    </div>
  `;
}

function refreshInstallCardD9() {
  const box = document.getElementById("companyInstallBoxD9");
  if (!box) return;
  box.outerHTML = buildInstallAppCardD9();
}

function renderCompanyInfo() {
  const box = $("#companyContent");
  if (!box) return;

  const insti = confText("insti", "Distribuidora local orientada a la atención ágil de clientes, toma de pedidos y consulta de precios actualizados.");
  const direc = confText("direc", "");
  const wasapp = confText("wasapp", "");
  const horarios = confText("horarios", "");
  const waDigits = onlyDigitsText(wasapp);

  let html = "";

  if (insti) {
    html += `
      <div class="company-card-d9">
        <strong>Sobre la empresa</strong>
        <p>${esc(insti).replace(/\n/g, "<br>")}</p>
      </div>
    `;
  }

  html += `
    <div class="company-card-d9">
      <strong>Qué podés hacer desde la app</strong>
      <ul>
        <li>Consultar lista de precios.</li>
        <li>Armar pedidos por cliente.</li>
        <li>Enviar pedidos por WhatsApp.</li>
        <li>Trabajar con soporte offline.</li>
      </ul>
    </div>
  `;

  const contacto = [];

  if (direc) {
    contacto.push(`
      <div>
        <span>Dirección</span>
        <strong>${esc(direc)}</strong>
      </div>
    `);
  }

  if (wasapp) {
    contacto.push(`
      <div>
        <span>WhatsApp</span>
        <strong>${waDigits ? `<a href="https://wa.me/${waDigits}" target="_blank" rel="noopener">${esc(wasapp)}</a>` : esc(wasapp)}</strong>
      </div>
    `);
  }

  if (horarios) {
    contacto.push(`
      <div>
        <span>Horarios</span>
        <strong>${esc(horarios)}</strong>
      </div>
    `);
  }

  if (contacto.length) {
    html += `
      <div class="company-contact-d9">
        <strong>Contactos</strong>
        <div class="company-grid-d9">
          ${contacto.join("")}
        </div>
      </div>
    `;
  }


  html += buildInstallAppCardD9();

  const supportName = state.support?.["chip_info"] || state.support?.["chip info"] || "M.J.S.";
  const supportVersion = state.support?.["version"] || state.support?.["versión"] || APP_VERSION;
  const supportDate = state.support?.["fecha"] || state.support?.["version_fecha"] || "";
  const supportPhone = state.support?.["whatsapp"] || state.support?.["telefono"] || "";
  const supportMail = state.support?.["email"] || "";

  html += `
    <div class="company-support-full-d9">
      <div>
        <span>Soporte técnico</span>
        <strong>${esc(supportName)}</strong>
      </div>
      <div class="company-support-meta-d9">
        <p><b>Versión:</b> ${esc(supportVersion)}</p>
        ${supportDate ? `<p><b>Actualizada:</b> ${esc(supportDate)}</p>` : ""}
        ${supportPhone ? `<p><b>WhatsApp soporte:</b> ${esc(supportPhone)}</p>` : ""}
        ${supportMail ? `<p><b>Email:</b> ${esc(supportMail)}</p>` : ""}
      </div>
    </div>
  `;

  box.innerHTML = html;
}

function openCompanyInfo(pushHistory = true) {
  renderCompanyInfo();
  const modal = $("#companyModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  if (pushHistory && window.history && window.history.pushState) {
    history.pushState({ modal: "company", view: state.currentView || "home" }, "", location.href);
  }
}

function closeCompanyInfo() {
  const modal = $("#companyModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}


function logoutSeller() {
  state.seller = null;
  localStorage.removeItem(STORAGE_KEYS.seller);
  state.activePriceList = "lista_1";
  state.selectedClient = null;
  state.selectedCategory = "";
  state.priceCategory = "";
  state.cart = [];
  syncSessionUI();
  renderSellerBadge();
  applyUserContext();
  renderAll();
  closeLogin();
  showView("home");
  toast("Sesión cerrada.");
}

function loginSeller() {
  const userValue = $("#sellerUser").value.trim().toLowerCase();
  const pass = $("#sellerPass").value.trim();
  const seller = state.users.find(s => s.usuario === userValue);
  if (!seller) return toast("Usuario no encontrado.");
  if (!pass || pass !== String(seller.clave || "").trim()) return toast("Clave incorrecta.");
  state.seller = seller;
  saveJSON(STORAGE_KEYS.seller, { id: seller.id, nombre: seller.nombre, usuario: seller.usuario });
  applyUserContext();
  syncSessionUI();
  renderAll();
  closeLogin();
  showView("home");
  toast(`Hola, ${seller.nombre}`);
}

function getActivePriceList() {
  if (!state.seller) return "lista_1";
  if (state.seller?.rol === "cliente") return state.selectedClient?.lista_1 || state.seller.lista_1 || "lista_1";
  return state.activePriceList || "lista_1";
}

function priceLabel(key) {
  const labels = {
    lista_1: "Lista_1 · Contado",
    lista_1: "Lista_2 · Pueblos",
    lista_1: "Lista_3 · Vendedores"
  };
  return labels[key] || key || "Lista";
}

function productPrice(product) {
  const key = getActivePriceList();
  let source = product;

  // D9: al reutilizar desde historial el item trae id/nombre/precio,
  // pero no trae el objeto completo con precios por lista.
  // Si existe en catálogo, usamos el catálogo para recalcular según cliente/lista.
  const itemId = String(product?.id || product?.id_producto || product?.producto_id || "").trim();
  if ((!source?.precios || typeof source.precios !== "object") && itemId && Array.isArray(state.products)) {
    source = state.products.find(p => String(p.id || "").trim() === itemId) || source;
  }

  const byList = parseD9Number(source?.precios?.[key] || 0);
  if (byList > 0) return byList;

  // Fallback defensivo: nunca pisar con 0 un precio que venía guardado en historial.
  return parseD9Number(product?.precio || product?.price || product?.precio_unitario || 0);
}

function renderQuickLabels() {
  const isClient = state.seller?.rol === "cliente";
  const guestMode = !state.seller;
  $("#selectedClientLabel").textContent = isClient
    ? (state.selectedClient?.nombre_real || state.selectedClient?.nombre || "Cliente asignado")
    : (state.selectedClient
        ? (state.selectedClient.ocasional ? (state.selectedClient.nombre_real || "Cliente nuevo / ocasional") : state.selectedClient.nombre)
        : (guestMode ? "Cliente nuevo / ocasional" : "Seleccionar cliente"));
  $("#selectedCategoryLabel").textContent = state.selectedCategory ? cleanCategory(state.selectedCategory) : "Todas las categorías";
  $("#selectedProductsLabel").textContent = state.cart.length ? `${state.cart.length} productos seleccionados` : "Seleccionar productos";
  const clientBtn = $("#btnOpenClients");
  if (clientBtn) {
    clientBtn.disabled = isClient;
    clientBtn.classList.toggle("is-locked", isClient);
    if (guestMode) {
      const guestSource = state.selectedClient || state.guestClientDraft;
      const guestLabel = guestSource
        ? [guestSource.nombre_real || guestSource.nombre || "Cliente nuevo / ocasional", guestSource.telefono || guestSource.ciudad || ""].filter(Boolean).join(" · ")
        : "Cargar datos primero";
      const titleEl = clientBtn.querySelector(".picker-label");
      const valueEl = document.getElementById("selectedClientLabel");
      if (titleEl) titleEl.textContent = "Cliente";
      if (valueEl) valueEl.textContent = guestLabel;
      clientBtn.dataset.title = "Cliente";
      clientBtn.dataset.sub = guestSource ? guestLabel : "Cargar datos del comprador";
      clientBtn.classList.toggle("has-client", !!guestSource);
    }
  }
  const clientSearch = $("#clientSearch");
  if (clientSearch && isClient) clientSearch.value = "";
  const productHint = $("#productModalHint");
  if (productHint) {
    const activeProductCategory = state.productPickerMode === "mostrador" ? state.mostradorCategory : state.selectedCategory;
    const catLabel = activeProductCategory ? cleanCategory(activeProductCategory) : "Todas las categorías";
    productHint.innerHTML = `
      <div class="modal-category-box-d9">
        <div class="modal-category-current-d9">
          <span>Cat.</span>
          <strong>${esc(catLabel)}</strong>
        </div>
        <button id="btnCategoryInsideProductModal" class="modal-category-button-d9" type="button">Cambiar categoría</button>
      </div>
    `;
  }
}

function renderClients() {
  const term = $("#clientSearch").value.trim().toLowerCase();
  const list = $("#clientList");
  const canBrowseClients = ["vendedor", "mostrador"].includes(String(state.seller?.rol || "").toLowerCase());

  const base = canBrowseClients
    ? state.clients
        .filter(c => !term || c.nombre.toLowerCase().includes(term))
        .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base", numeric: true }))
    : [];

  const filtered = base.slice(0, 600);

  const occasionalBtn = `
    <button class="option-item option-button special-option" id="btnOccasionalClient" type="button">
      <strong>+ Cliente nuevo / ocasional</strong>
      <div class="option-meta">Cargar nombre, dirección, ciudad y teléfono para este pedido</div>
    </button>`;

  if (!canBrowseClients) {
    list.innerHTML = occasionalBtn;
    return;
  }

  const activeClient = state.clientPickerMode === "mostrador" ? state.mostradorClient : state.selectedClient;
  list.innerHTML = filtered.length
    ? occasionalBtn + filtered.map(c => `
      <button class="option-item option-button ${activeClient?.id === c.id ? "is-selected" : ""}" data-client-id="${esc(c.id)}" type="button">
        <strong>${esc(c.nombre)}</strong>
        <div class="option-meta">${esc(c.telefono || "Sin teléfono")} · ${esc(c.direccion || "Sin dirección")}</div>
      </button>`).join("")
    : occasionalBtn + '<div class="empty-state">No encontré clientes.</div>';
}

function selectClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;

  if (state.clientPickerMode === "mostrador") {
    state.mostradorClient = c;
    renderClients();
    renderMostradorD9();
    closeModal("client");
    toast("Cliente cargado en mostrador.");
    return;
  }

  const previousClientId = state.selectedClient?.id || "";
  state.selectedClient = c;
  if (["vendedor", "mostrador"].includes(String(state.seller?.rol || "").toLowerCase())) {
    const previousActive = state.activePriceList || "lista_1";
    const nextList = c.lista_1 || "lista_1";
    const changedClient = previousClientId && String(previousClientId) !== String(c.id);
    const changedList = nextList !== previousActive;
    state.activePriceList = nextList;
    state.manualPriceOverride = false;
    if ((changedClient || changedList) && state.cart.length) {
      state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
      toast("Cambiaste de cliente.");
    }
    refreshPricesAcrossApp();
  }
  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderQuickLabels();
  renderCart();
  if (typeof renderMostradorD9 === "function") renderMostradorD9();
  closeModal("client");
}

function renderSelectedClient() {
  const box = $("#selectedClientCard");
  if (!box) return;
  if (!state.selectedClient || !state.seller) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <strong>${esc(state.selectedClient.ocasional ? "Cliente nuevo / ocasional" : state.selectedClient.nombre)}</strong>
    <div class="mini-text">${esc(state.selectedClient.ocasional ? (state.selectedClient.nombre_real || state.selectedClient.nombre) : (state.selectedClient.telefono || "Sin teléfono"))}</div>
    <div class="mini-text">${esc(state.selectedClient.direccion || "Sin dirección")}</div>`;
}

function renderOrderPriceListControls() {
  const box = $("#orderPriceListBox");
  const select = $("#orderPriceListSelect");
  const info = $("#orderPriceListInfo");
  if (!box || !select || !info) return;

  if (state.seller?.rol === "vendedor") {
    box.classList.remove("hidden");
    select.value = state.activePriceList || "lista_1";
    const clientName = state.selectedClient?.nombre_real || state.selectedClient?.nombre || "sin cliente";
    const defaultList = state.selectedClient?.lista_1 || "lista_1";
    const currentList = state.activePriceList || defaultList;
    const override = !!state.selectedClient && currentList !== defaultList;
    info.textContent = override
      ? `Lista cambiada para ${clientName}: ${priceLabel(currentList)} (por defecto ${priceLabel(defaultList)}).`
      : `Precio activo para ${clientName}: ${priceLabel(currentList)}.`;
  } else {
    box.classList.add("hidden");
    info.textContent = "";
  }
}

function openOccasionalClientModal() {
  $("#occasionalName").value = "";
  $("#occasionalPhone").value = "";
  $("#occasionalAddress").value = "";
  $("#occasionalCity").value = "";
  const priceField = $("#occasionalPriceList");
  const priceWrap = $("#occasionalPriceWrap");
  if (priceField) priceField.value = getActivePriceList() || "lista_1";
  // D9: cliente ocasional siempre usa lista_1 por defecto; no se muestra selector de lista.
  if (priceWrap) priceWrap.classList.add("hidden");
  closeModal("client");
  openModal("occasionalClient");
}

function saveOccasionalClient() {
  const nombre = $("#occasionalName").value.trim();
  const telefono = $("#occasionalPhone").value.trim();
  const direccion = $("#occasionalAddress").value.trim();
  const ciudad = $("#occasionalCity").value.trim();
  const lista = "lista_1";

  if (!nombre) return toast("Cargá al menos el nombre del cliente.");

  const nextId = `ocasional_${Date.now()}`;
  const occasionalClient = {
    id: nextId,
    nombre: `NUEVO | ${nombre}${telefono ? ' | ' + telefono : ''}${direccion ? ' | ' + direccion : ''}${ciudad ? ' | ' + ciudad : ''}`,
    nombre_real: nombre,
    telefono,
    direccion: [direccion, ciudad].filter(Boolean).join(" · "),
    ciudad,
    lista_1: lista,
    ocasional: true
  };

  if (state.clientPickerMode === "mostrador") {
    state.mostradorClient = occasionalClient;
    closeModal("occasionalClient");
    closeModal("client");
    renderMostradorD9();
    showView("mostrador");
    toast("Cliente ocasional cargado en mostrador.");
    return;
  }

  const previousId = state.selectedClient?.id || "";
  state.selectedClient = occasionalClient;
  state.guestClientDraft = state.selectedClient;
  renderSellerBadge();
  if (!state.seller) {
    saveJSON(STORAGE_KEYS.guestClient, state.guestClientDraft);
  }
  state.activePriceList = lista;
  if (previousId && previousId !== nextId && state.cart.length) {
    state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
    toast("Cliente ocasional cargado.");
  }
  closeModal("occasionalClient");
  closeModal("client");
  closeModal("category");
  closeModal("product");
  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderQuickLabels();
  const valueEl = document.getElementById("selectedClientLabel");
  if (valueEl) valueEl.textContent = [nombre, telefono || ciudad || ""].filter(Boolean).join(" · ");
  refreshPricesAcrossApp();
  renderCart();
  showView("order");
}

function renderPriceListControls() {
  const modeBox = $("#priceListModeBox");
  const info = $("#priceListInfo");
  const select = $("#priceListSelect");
  if (!modeBox || !info || !select) return;
  info.textContent = "";
  info.classList.add("hidden"); // D9 hide price list info

  if (!state.seller) {
    state.activePriceList = "lista_1";
    modeBox.classList.add("hidden");
    info.textContent = "";
    renderPriceCategoryChips();
    return;
  }

  if (state.seller.rol === "vendedor") {
    modeBox.classList.remove("hidden");
    select.value = getActivePriceList();
    info.textContent = "";
  } else {
    modeBox.classList.add("hidden");
    info.textContent = "";
  }

  renderPriceCategoryChips();
}

function renderPriceCategoryChips() {
  const wrap = $("#priceCategoryWrap");
  if (!wrap) return;
  const label = state.priceCategory ? cleanCategory(state.priceCategory) : "Todas las categorías";
  wrap.innerHTML = `
    <button id="btnOpenPriceCategories" class="picker-btn compact-picker" type="button">
      <span class="picker-label-inline">Categoría</span>
      <strong>${esc(label)}</strong>
    </button>`;
  renderPriceCategoryModal();
}

function renderPriceCategoryModal() {
  const list = $("#priceCategoryList");
  if (!list) return;
  const cats = categoriesList();
  list.innerHTML = `
    <button class="option-item option-button ${!state.priceCategory ? "is-selected" : ""}" data-price-category="" type="button">
      <strong>Todas las categorías</strong>
    </button>` + cats.map(cat => `
    <button class="option-item option-button ${state.priceCategory === cat ? "is-selected" : ""}" data-price-category="${esc(cat)}" type="button">
      <strong>${esc(cat)}</strong>
    </button>`).join("");
}


function productHasValidPrice(p) {
  return Number(productPrice(p)) > 0;
}

function sortByName(a, b) {
  return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base", numeric: true });
}

function cleanCategory(cat) {
  return String(cat || "")
    .replace(/^\s*\d+[\s\-._:]*/, "")
    .trim();
}

function productCode(p) {
  return String(p?.id || p?.codigo || p?.cod || p?.sku || "").trim();
}

function productMatchesTerm(p, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return true;
  return [p?.nombre, p?.categoria, productCode(p)]
    .some(v => String(v || "").toLowerCase().includes(t));
}

function productMetaLine(p, includePrice = true) {
  const code = productCode(p);
  const parts = [];
  if (code) parts.push(`Cód. ${code}`);
  if (includePrice) parts.push(`${money(productPrice(p))} c/u`);
  return parts.join(" · ");
}

function itemMetaLine(item) {
  const code = productCode(item);
  const parts = [];
  if (code) parts.push(`Cód. ${code}`);
  parts.push(`${money(Number(item.precio || 0))} c/u`);
  return parts.join(" · ");
}


function renderPriceProducts() {
  const box = $("#priceProductsList");
  if (!box) return;
  const term = (state.priceSearch || "").toLowerCase();
  const cat = state.priceCategory;

  let filtered = [];

  if (term) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => productMatchesTerm(p, term) && (!cat || p.categoria === cat))
      .sort(sortByName)
      .slice(0, 500);
  } else if (cat) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.categoria === cat)
      .sort(sortByName)
      .slice(0, 500);
  } else {
    filtered = state.products
      .filter(productHasValidPrice)
      .sort(sortByName)
      .slice(0, 200);
  }

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">No encontré productos con precio válido para esa lista.</div>';
    return;
  }

  box.innerHTML = filtered.map(p => `
    <div class="price-row">
      <div class="price-row-main">
        <strong>${esc(p.nombre)}</strong>
        <div class="option-meta">${esc([productCode(p) ? `Cód. ${productCode(p)}` : "", cleanCategory(p.categoria)].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="price-row-side">
        <strong>${money(productPrice(p))}</strong>

      </div>
    </div>
  `).join("");
}


function getPriceListFilteredProductsD9() {
  const term = String(state.priceSearch || "").trim().toLowerCase();
  const cat = state.priceCategory || "";
  return (state.products || [])
    .filter(productHasValidPrice)
    .filter(p => (!term || productMatchesTerm(p, term)) && (!cat || p.categoria === cat))
    .sort((a, b) => {
      const ca = cleanCategory(a.categoria || "");
      const cb = cleanCategory(b.categoria || "");
      if (!cat && ca !== cb) return ca.localeCompare(cb, "es", { sensitivity: "base", numeric: true });
      return sortByName(a, b);
    });
}

function pdfAsciiD9(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n").replace(/Ñ/g, "N")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscD9(value) {
  return pdfAsciiD9(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfMoneyD9(value) {
  return pdfAsciiD9(money(Number(value || 0)));
}

function pdfWrapD9(text, maxChars) {
  const words = pdfAsciiD9(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach(w => {
    if (!line) { line = w; return; }
    if ((line + " " + w).length <= maxChars) line += " " + w;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function pdfTextD9(txt, x, y, size = 9, font = "F1") {
  return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscD9(txt)}) Tj ET\n`;
}

function pdfTextRightD9(txt, xRight, y, size = 9, font = "F1") {
  const s = pdfAsciiD9(txt);
  const approx = s.length * size * 0.48;
  return pdfTextD9(s, xRight - approx, y, size, font);
}

function pdfLineD9(x1, y1, x2, y2) {
  return `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
}

async function loadPdfLogoJpegD9() {
  try {
    const src = "icons/logo_d9.png";
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

    function makeJpeg(size, alpha = 1, quality = 0.88) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, size, size);
      const scale = Math.min(size / img.width, size / img.height) * 0.92;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      ctx.globalAlpha = 1;
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      return atob(dataUrl.split(",")[1] || "");
    }

    const size = 160;
    const watermarkSize = 520;
    return {
      data: makeJpeg(size, 1, 0.88),
      width: size,
      height: size,
      watermarkData: makeJpeg(watermarkSize, 0.08, 0.82),
      watermarkWidth: watermarkSize,
      watermarkHeight: watermarkSize
    };
  } catch (err) {
    console.warn("No se pudo cargar logo real para PDF:", err);
    return null;
  }
}

function buildPriceListPdfBlobD9(products, logoImage) {
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 36;
  const topY = 742;
  const bottomY = 54;
  const xCode = 42;
  const xName = 102;
  const xPrice = 552;
  const pages = [];
  let page = [];
  let y = topY;
  let rowIndex = 0;
  const generated = new Date();
  const fecha = generated.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  const enviadaPor = pdfAsciiD9(state.seller?.nombre || state.seller?.usuario || "D9");
  const term = String(state.priceSearch || "").trim();
  const selectedCat = state.priceCategory || "";
  const cleanTerm = pdfAsciiD9(term).toUpperCase();
  let titleExtra = "Lista completa";
  if (selectedCat && term) {
    titleExtra = `${cleanCategory(selectedCat)} · Filtro: ${cleanTerm}`;
  } else if (selectedCat) {
    titleExtra = cleanCategory(selectedCat);
  } else if (term) {
    titleExtra = `Resultados filtrados: ${cleanTerm}`;
  }
  const maxNameChars = 54;
  const rowLineH = 9;
  const rowMinH = 14;
  const rowPadTop = 3;
  const rowPadBottom = 3;
  const headerH = 27;
  const columnsH = 15;
  const pageBodyH = topY - bottomY;

  function newPage() {
    if (page.length) pages.push(page);
    page = [];
    y = topY;
    rowIndex = 0;
  }

  function remainingH() {
    return y - bottomY;
  }

  function ensureSpace(h) {
    if (remainingH() < h && page.length) newPage();
  }

  function rowInfo(p) {
    const nameLines = pdfWrapD9(p.nombre || "", maxNameChars).slice(0, 3);
    const rowH = Math.max(rowMinH, nameLines.length * rowLineH + rowPadTop + rowPadBottom);
    return { nameLines, rowH };
  }

  function categoryHeight(group) {
    return headerH + columnsH + group.items.reduce((sum, p) => sum + rowInfo(p).rowH, 0);
  }

  function addCategoryHeader(cat, repeated = false) {
    const label = cleanCategory(cat || "Sin categoria").toUpperCase() + (repeated ? " (CONT.)" : "");
    ensureSpace(headerH + columnsH + rowMinH);
    const catBarY = y - 18;
    page.push(`0.87 0.95 0.99 rg ${margin.toFixed(2)} ${catBarY.toFixed(2)} ${(pageW-margin*2).toFixed(2)} 18 re f\n`);
    page.push(`0.10 0.45 0.78 rg ${margin.toFixed(2)} ${catBarY.toFixed(2)} 4 18 re f\n`);
    page.push(`0.02 0.16 0.30 rg ` + pdfTextD9(label, xCode + 8, y - 13, 10, "F2"));
    y -= headerH;
    addColumns();
    rowIndex = 0;
  }

  function addColumns() {
    page.push(`0.10 0.24 0.38 rg ` + pdfTextD9("Cod", xCode, y, 8, "F2"));
    page.push(pdfTextD9("Articulo", xName, y, 8, "F2"));
    page.push(pdfTextRightD9("Precio final con IVA", xPrice, y, 8, "F2"));
    page.push(`0.70 0.78 0.84 RG ` + pdfLineD9(margin, y - 5, pageW - margin, y - 5));
    y -= columnsH;
  }

  function addRow(p) {
    const { nameLines, rowH } = rowInfo(p);
    if (remainingH() < rowH) {
      newPage();
      return false;
    }

    const rowTop = y;
    const rowBottom = y - rowH;
    if (rowIndex % 2 === 0) {
      page.push(`0.965 0.970 0.978 rg ${margin.toFixed(2)} ${rowBottom.toFixed(2)} ${(pageW-margin*2).toFixed(2)} ${rowH.toFixed(2)} re f\n`);
    }

    const code = productCode(p) || "";
    const baseY = rowTop - rowPadTop - 8;
    page.push(`0 0 0 rg ` + pdfTextD9(code, xCode, baseY, 8));
    nameLines.forEach((ln, i) => page.push(pdfTextD9(ln, xName, baseY - (i * rowLineH), 8)));
    page.push(pdfTextRightD9(pdfMoneyD9(productPrice(p)), xPrice, baseY, 8, "F2"));
    page.push(`0.91 0.94 0.96 RG ` + pdfLineD9(margin, rowBottom, pageW - margin, rowBottom));
    y -= rowH;
    rowIndex++;
    return true;
  }

  function groupProducts(list) {
    if (selectedCat) {
      return [{ cat: cleanCategory(selectedCat || list[0]?.categoria || "Sin categoria"), items: list }];
    }
    const groups = [];
    let current = null;
    list.forEach(p => {
      const cat = cleanCategory(p.categoria || "Sin categoria");
      if (!current || current.cat !== cat) {
        current = { cat, items: [] };
        groups.push(current);
      }
      current.items.push(p);
    });
    return groups;
  }

  const groups = groupProducts(products);

  function renderCategoryGroup(group) {
    addCategoryHeader(group.cat, false);
    for (let i = 0; i < group.items.length; i++) {
      if (!addRow(group.items[i])) {
        addCategoryHeader(group.cat, true);
        addRow(group.items[i]);
      }
    }
  }

  const pendingGroups = groups.filter(g => g.items && g.items.length);

  function findFillerGroupIndex(maxH) {
    if (selectedCat || maxH <= 0) return -1;
    // Busca una categoría posterior que entre completa en el hueco actual.
    // No usa categorías gigantes como relleno porque esas siempre arrancan mejor en página nueva.
    let bestIdx = -1;
    let bestH = 0;
    for (let i = 1; i < pendingGroups.length; i++) {
      const h = categoryHeight(pendingGroups[i]);
      if (h <= pageBodyH && h <= maxH && h > bestH) {
        bestIdx = i;
        bestH = h;
      }
    }
    return bestIdx;
  }

  while (pendingGroups.length) {
    const group = pendingGroups[0];
    const fullH = categoryHeight(group);
    const isHuge = fullH > pageBodyH;
    const rem = remainingH();

    // Tetris real: si la categoría que sigue no entra en el hueco actual
    // —sea chica o gigante— intentamos rellenar con otra categoría posterior que sí entre completa.
    if (!selectedCat && page.length && rem > 0 && fullH > rem) {
      const fillerIndex = findFillerGroupIndex(rem);
      if (fillerIndex > 0) {
        const [filler] = pendingGroups.splice(fillerIndex, 1);
        renderCategoryGroup(filler);
        continue;
      }
      newPage();
      continue;
    }

    if (page.length && isHuge) {
      newPage();
    }

    pendingGroups.shift();
    renderCategoryGroup(group);
  }


  if (page.length) pages.push(page);
  if (!pages.length) pages.push([pdfTextD9("Sin productos para listar.", margin, topY, 10)]);

  let logoImageId = null;
  let logoWatermarkImageId = null;

  function pageHeader(pageNum, total) {
    let s = "";
    s += `0.95 0.98 1 rg 28 774 539 44 re f\n`;
    s += `0.38 0.74 0.91 RG 28 774 539 44 re S\n`;
    if (logoImageId) {
      s += `q 34 0 0 34 42 782 cm /ImLogo Do Q\n`;
    } else {
      s += `0.10 0.45 0.78 rg 42 786 34 22 re f\n`;
      s += `1 1 1 rg ` + pdfTextD9("D9", 49, 793, 14, "F2");
    }
    s += `0.02 0.16 0.30 rg ` + pdfTextD9("DISTRIBUIDORA D9", 88, 800, 16, "F2");
    s += `0.25 0.38 0.48 rg ` + pdfTextD9("Lista de precios - " + titleExtra, 88, 784, 9);
    s += pdfTextRightD9("Generada: " + fecha, 552, 802, 8);
    s += pdfTextRightD9("Enviada por: " + enviadaPor, 552, 788, 8);
    return s;
  }

  function pageWatermark() {
    let s = "";
    if (logoWatermarkImageId) {
      // Logo real gigante, preaclarado en canvas para compatibilidad entre visores PDF.
      s += `q 330 0 0 330 132 250 cm /ImLogoW Do Q
`;
    } else {
      s += `0.94 0.98 1 rg ` + pdfTextD9("D9", 214, 392, 148, "F2");
      s += `0 0 0 rg `;
    }
    return s;
  }


  function pageFooter(pageNum, total) {
    let s = "";
    s += `0.70 0.78 0.84 RG ` + pdfLineD9(margin, 38, pageW - margin, 38);
    s += `0.35 0.45 0.52 rg ` + pdfTextD9("Precios sujetos a modificacion sin previo aviso.", margin, 24, 7);
    s += pdfTextRightD9(`Pagina ${pageNum} de ${total}`, pageW - margin, 24, 7);
    return s;
  }

  const objects = [];
  function obj(content) { objects.push(content); return objects.length; }
  const catalogId = obj("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesKids = [];
  const pagesId = 2;
  objects.push("");
  const font1Id = obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const font2Id = obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  if (logoImage && logoImage.data) {
    logoImageId = obj(`<< /Type /XObject /Subtype /Image /Width ${Number(logoImage.width || 160)} /Height ${Number(logoImage.height || 160)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.data.length} >>\nstream\n${logoImage.data}\nendstream`);
  }
  if (logoImage && logoImage.watermarkData) {
    logoWatermarkImageId = obj(`<< /Type /XObject /Subtype /Image /Width ${Number(logoImage.watermarkWidth || 520)} /Height ${Number(logoImage.watermarkHeight || 520)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.watermarkData.length} >>\nstream\n${logoImage.watermarkData}\nendstream`);
  }

  const pageStreams = pages.map((body, i) => pageHeader(i + 1, pages.length) + pageWatermark() + body.join("") + pageFooter(i + 1, pages.length));
  pageStreams.forEach(stream => {
    const contentId = objects.length + 2;
    const xObjectEntries = [];
    if (logoImageId) xObjectEntries.push(`/ImLogo ${logoImageId} 0 R`);
    if (logoWatermarkImageId) xObjectEntries.push(`/ImLogoW ${logoWatermarkImageId} 0 R`);
    const xObjects = xObjectEntries.length ? `/XObject << ${xObjectEntries.join(" ")} >>` : "";
    const pageId = obj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> ${xObjects} >> /Contents ${contentId} 0 R >>`);
    pagesKids.push(`${pageId} 0 R`);
    obj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pagesKids.join(" ")}] /Count ${pagesKids.length} >>`;

  let pdf = "%PDF-1.4\n% D9\n";
  const offsets = [0];
  objects.forEach((content, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${content}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  const filename = `D9-lista-precios-${generated.toISOString().slice(0,10)}.pdf`;
  return { blob: new Blob([bytes], { type: "application/pdf" }), filename };
}

async function sharePriceListPdfD9() {
  const products = getPriceListFilteredProductsD9();
  if (!products.length) {
    toast("No hay productos para compartir.");
    return;
  }

  try {
    toast("Armando PDF...");
    const logoImage = await loadPdfLogoJpegD9();
    const { blob, filename } = buildPriceListPdfBlobD9(products, logoImage);
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData = {
      title: "Lista de precios D9",
      text: "Lista de precios actualizada de Distribuidora D9.",
      files: [file]
    };
    if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
      await navigator.share(shareData);
      toast("Lista lista para compartir.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 15000);
    toast("PDF descargado. Compartilo desde Descargas.");
  } catch (err) {
    console.error("No se pudo compartir PDF", err);
    toast("No se pudo generar/compartir el PDF.");
  }
}

function refreshPricesAcrossApp() {
  state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
  renderQuickLabels();
  renderProducts();
  renderCart();
  renderOrderPriceListControls();
  renderPriceListControls();
  renderPriceProducts();
}

function categoriesList() {
  return [...new Set(
    state.products
      .filter(productHasValidPrice)
      .map(p => p.categoria)
      .filter(Boolean)
  )].sort((a, b) => cleanCategory(a).localeCompare(cleanCategory(b), "es", { sensitivity: "base", numeric: true }));
}

function renderCategories() {
  const list = $("#categoryList");
  const cats = categoriesList();
  const activeCategory = state.categoryPickerMode === "mostrador" ? state.mostradorCategory : state.selectedCategory;
  const allItem = `
    <button class="option-item option-button ${!activeCategory ? "is-selected" : ""}" data-category="" type="button">
      <strong>Todas las categorías</strong>
      <div class="option-meta">Mostrar todos los productos activos</div>
    </button>`;
  list.innerHTML = allItem + cats.map(c => `
    <button class="option-item option-button ${activeCategory === c ? "is-selected" : ""}" data-category="${esc(c)}" type="button">
      <strong>${esc(cleanCategory(c))}</strong>
    </button>`).join("");
}

function clearProductSearchD9(shouldRender = true) {
  const input = $("#productSearch");
  if (!input) return;
  if (input.value) {
    input.value = "";
    if (shouldRender) renderProducts();
  }
}

function selectCategory(category) {
  if (state.categoryPickerMode === "mostrador") {
    state.mostradorCategory = category;
    clearProductSearchD9(false);
    renderCategories();
    renderProducts();
    renderMostradorD9();
    closeModal("category");
    return;
  }
  state.selectedCategory = category;
  clearProductSearchD9(false);
  renderCategories();
  renderProducts();
  renderQuickLabels();
  if (typeof renderMostradorD9 === "function") renderMostradorD9();
  closeModal("category");
}

function renderProducts() {
  const term = $("#productSearch").value.trim().toLowerCase();
  const pickerMode = state.productPickerMode === "mostrador" ? "mostrador" : "order";
  const cat = pickerMode === "mostrador" ? state.mostradorCategory : state.selectedCategory;
  const list = $("#productList");
  const activeCart = pickerMode === "mostrador" ? state.mostradorCart : state.cart;

  let filtered = [];

  if (term) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => productMatchesTerm(p, term))
      .sort(sortByName)
      .slice(0, 500);
  } else if (cat) {
    filtered = state.products
      .filter(productHasValidPrice)
      .filter(p => p.categoria === cat)
      .sort(sortByName)
      .slice(0, 500);
  } else {
    list.innerHTML = '<div class="empty-state">Elegí una categoría o buscá un producto.</div>';
    return;
  }

  list.innerHTML = filtered.length
    ? filtered.map(p => {
      const cartItem = activeCart.find(x => String(x.id) === String(p.id));
      const selected = !!cartItem;
      const cantidad = Number(cartItem?.cantidad || 1);
      const precio = Number(cartItem?.precio || productPrice(p) || 0);
      const subtotal = cantidad * precio;
      const qtyText = pickerMode === "mostrador" ? mostradorQtyTextD9(cantidad) : String(cantidad);
      return `
        <button class="product-item product-picker ${selected ? "is-selected" : ""} ${selected && pickerMode === "mostrador" ? "is-mostrador-selected-d9" : ""}" data-toggle-product="${esc(p.id)}" ${selected ? 'data-no-toggle="true"' : ''} type="button">
          <div class="product-copy product-main-d9" ${selected ? 'data-no-toggle="true"' : ''}>
            <strong>${esc(p.nombre)}</strong>
            <div class="option-meta">${esc(productMetaLine(p))}</div>
            ${term && cat && p.categoria !== cat ? `<div class="option-meta product-cross-category-d9">Cat. ${esc(cleanCategory(p.categoria))}</div>` : ""}
          </div>
          <div class="product-side product-qty-zone-d9" ${selected ? 'data-no-toggle="true"' : ''}>
            ${selected ? (pickerMode === "mostrador" ? `
              <div class="qty-inline-d9 mostrador-product-qty-d9" data-no-toggle="true">
                <span class="qty-inline-btn-d9" data-product-qty="minus" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Restar">−</span>
                <span class="qty-inline-btn-d9 qty-inline-value-d9" data-mostrador-qty="${esc(p.id)}" role="button" tabindex="0" aria-label="Editar cantidad">${esc(qtyText)}</span>
                <span class="qty-inline-btn-d9" data-product-qty="plus" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Sumar">+</span>
              </div>
              <div class="product-line-total-d9">${money(subtotal)}</div>
            ` : `
              <div class="qty-inline-d9" data-no-toggle="true">
                <span class="qty-inline-btn-d9" data-product-qty="minus" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Restar unidad">−</span>
                <span class="qty-inline-btn-d9" data-product-qty="plus" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Sumar unidad">+</span>
              </div>
              <div class="product-line-total-d9">x${fmtQtyD9(cantidad)} · ${money(subtotal)}</div>
            `) : `<div class="pick-state">Tocar para agregar</div>`}
          </div>
        </button>`;
    }).join("")
    : '<div class="empty-state">No encontré productos con precio válido.</div>';
}

function toggleProduct(id) {
  if (state.productPickerMode === "mostrador") {
    const existing = state.mostradorCart.find(x => String(x.id) === String(id));
    if (existing) {
      state.mostradorCart = state.mostradorCart.filter(x => String(x.id) !== String(id));
    } else {
      const p = state.products.find(x => String(x.id) === String(id));
      if (!p) return;
      state.mostradorCart.push({ id: p.id, nombre: p.nombre, precio: productPrice(p), cantidad: 1 });
    }
    renderProducts();
    renderMostradorD9();
    return;
  }
  const existing = state.cart.find(x => x.id === id);
  if (existing) {
    state.cart = state.cart.filter(x => x.id !== id);
  } else {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    state.cart.push({ ...p, precio: productPrice(p), cantidad: 1 });
  }
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function updateQty(id, delta) {
  if (state.productPickerMode === "mostrador") {
    const item = state.mostradorCart.find(x => String(x.id) === String(id));
    if (!item) return;
    item.cantidad = Number(item.cantidad || 0) + delta;
    asegurarPrecioMostradorD9(item);
    if (item.cantidad <= 0) state.mostradorCart = state.mostradorCart.filter(x => String(x.id) !== String(id));
    renderProducts();
    renderMostradorD9();
    return;
  }
  const item = state.cart.find(x => x.id === id);
  if (!item) return;
  item.cantidad += delta;
  item.precio = productPrice(item);
  if (item.cantidad <= 0) state.cart = state.cart.filter(x => x.id !== id);
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function removeItem(id) {
  state.cart = state.cart.filter(x => x.id !== id);
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function clearCart() {
  state.cart = [];
  clearOrderNoteGeneralD9(false);
  renderProducts();
  renderQuickLabels();
  renderCart();
}

function getItemNoteD9(item) {
  return String(item?.nota_item || item?.nota || "").trim();
}

function setItemNoteD9(id, value) {
  const item = state.cart.find(x => String(x.id) === String(id));
  if (!item) return;
  const note = String(value || "").trim();
  if (note) item.nota_item = note;
  else delete item.nota_item;
  renderCart();
}

function editItemNoteD9(id) {
  const item = state.cart.find(x => String(x.id) === String(id));
  if (!item) return toast("No encontré ese producto.");
  const current = getItemNoteD9(item);
  const value = window.prompt(`Nota para ${item.nombre || "producto"}:`, current);
  if (value === null) return;
  setItemNoteD9(id, value);
}

function setOrderNoteGeneralD9(value) {
  state.orderNoteGeneral = String(value || "").trim();
}

function clearOrderNoteGeneralD9(render = true) {
  state.orderNoteGeneral = "";
  const input = document.getElementById("orderNoteGeneralD9");
  if (input) input.value = "";
  if (render) renderCart();
}

function syncOrderNoteInputD9() {
  const input = document.getElementById("orderNoteGeneralD9");
  if (input && input.value !== state.orderNoteGeneral) input.value = state.orderNoteGeneral || "";
}

function cartTotal() {
  return state.cart.reduce((acc, item) => acc + item.precio * item.cantidad, 0);
}

function generateMessageText(payload = null) {
  const source = payload || {
    cliente: state.selectedClient,
    carrito: state.cart,
    vendedor: state.seller,
    total: cartTotal()
  };

  if (!source.cliente || !source.carrito.length) return "Seleccioná cliente y productos.";

  const clienteTexto = source.cliente?.nombre_real || source.cliente?.nombre || "";
  const unidadesTotales = source.carrito.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
  const rol = String(source.vendedor?.rol || "").trim().toLowerCase();

  const lines = ["🛒🛒"];

  if (rol === "cliente") {
    lines.push(`Cliente: ${source.vendedor?.nombre || clienteTexto}`);
  } else if (rol === "vendedor") {
    lines.push(`Cliente: ${clienteTexto}`);
    lines.push(`Vendedor: ${source.vendedor?.nombre || ""}`);
  } else {
    lines.push(`Invitado: ${clienteTexto || "Sin nombre"}`);
    const direccion = source.cliente?.direccion || "";
    if (direccion) lines.push(`Dirección: ${direccion}`);
  }

  lines.push(`Fecha: ${new Date().toLocaleString('es-AR', {hour12:false})}`);
  lines.push("────────────────────");

  source.carrito.forEach((item, index) => {
    lines.push(`${index + 1}) ${item.nombre}`);
    lines.push(`   · Cant: ${fmtQtyD9(item.cantidad || 0)}`);
    const note = getItemNoteD9(item);
    if (note) lines.push(`   · Nota: ${note}`);
  });

  const notaPedido = String(source.nota_pedido || source.notaPedido || state.orderNoteGeneral || "").trim();
  if (notaPedido) {
    lines.push("────────────────────");
    lines.push(`Nota pedido: ${notaPedido}`);
  }

  lines.push("────────────────────");
  lines.push(`Items: ${source.carrito.length} · Unidades: ${fmtQtyD9(unidadesTotales)}`);
  return lines.join("\n");
}


function ensureQtyModalD9() {
  let modal = document.getElementById("qtyModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "qtyModal";
  modal.className = "modal hidden qty-modal-d9";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal="qty"></div>
    <div class="modal-panel qty-panel-d9" role="dialog" aria-modal="true" aria-labelledby="qtyModalTitle">
      <div class="modal-head-row qty-head-d9">
        <div>
          <h3 id="qtyModalTitle">Cantidad</h3>
          <p id="qtyModalProduct" class="modal-text small-gap"></p>
        </div>
        <button class="ghost-x" data-close-modal="qty" type="button" aria-label="Cerrar">✕</button>
      </div>
      <label class="qty-input-label-d9" for="qtyModalInput">Ingresá cantidad</label>
      <input id="qtyModalInput" class="qty-input-d9" type="text" inputmode="decimal" min="0" step="any" autocomplete="off" />
      <p class="qty-help-d9">0 elimina el producto del pedido.</p>
      <div class="qty-actions-d9">
        <button id="btnQtyCancel" class="secondary-btn" type="button">Cancelar</button>
        <button id="btnQtyApply" class="primary-btn" type="button">Aplicar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector("#btnQtyCancel")?.addEventListener("click", closeQtyModalD9);
  modal.querySelector("#btnQtyApply")?.addEventListener("click", applyQtyModalD9);
  modal.querySelector("#qtyModalInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyQtyModalD9();
    if (e.key === "Escape") closeQtyModalD9();
  });

  return modal;
}

function openQtyModalD9(id, mode = "order") {
  const isMostrador = mode === "mostrador";
  const item = (isMostrador ? state.mostradorCart : state.cart).find(x => String(x.id) === String(id));
  if (!item) return;

  const modal = ensureQtyModalD9();
  state.qtyModalItemId = id;
  state.qtyModalMode = isMostrador ? "mostrador" : "order";

  const productEl = modal.querySelector("#qtyModalProduct");
  const input = modal.querySelector("#qtyModalInput");

  if (productEl) productEl.textContent = item.nombre || "Producto";
  if (input) input.value = isMostrador ? mostradorQtyTextD9(item.cantidad || 1) : String(Number(item.cantidad || 1));

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, 80);
}

function closeQtyModalD9() {
  const modal = document.getElementById("qtyModal");
  if (!modal) return;
  state.qtyModalItemId = "";
  state.qtyModalMode = "order";
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function applyQtyModalD9() {
  const id = state.qtyModalItemId;
  const input = document.getElementById("qtyModalInput");
  if (!id || !input) return;

  const raw = String(input.value || "").trim();
  const isMostrador = state.qtyModalMode === "mostrador";
  const qty = parseDecimalD9(raw);

  if (!Number.isFinite(qty) || qty < 0) {
    toast("Ingresá una cantidad válida.");
    input.focus();
    input.select();
    return;
  }

  const list = isMostrador ? state.mostradorCart : state.cart;
  const item = list.find(x => String(x.id) === String(id));
  if (!item) return closeQtyModalD9();

  if (qty <= 0) {
    if (isMostrador) state.mostradorCart = state.mostradorCart.filter(x => String(x.id) !== String(id));
    else state.cart = state.cart.filter(x => String(x.id) !== String(id));
  } else {
    item.cantidad = qty;
    if (isMostrador) asegurarPrecioMostradorD9(item);
    else item.precio = productPrice(item);
  }

  closeQtyModalD9();
  renderProducts();
  if (isMostrador) renderMostradorD9();
  else {
    renderQuickLabels();
    renderCart();
  }
}


function renderCart() {
  const box = $("#cartList");
  if (!state.cart.length) {
    box.className = "cart-list empty-state";
    box.textContent = "Todavía no agregaste productos.";
  } else {
    box.className = "cart-list";
    box.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <div class="cart-top">
          <div>
            <strong>${esc(item.nombre)}</strong>
            <div class="mini-text">${esc(itemMetaLine(item))}</div>
          </div>
          <button class="remove-btn cart-trash-btn-d9" data-remove-id="${esc(item.id)}" type="button" title="Quitar producto" aria-label="Quitar producto">🗑️</button>
        </div>
        <div class="qty-row qty-row-pro-d9">
          <button class="qty-btn" data-qty="minus" data-id="${esc(item.id)}" type="button">−</button>
          <div class="qty-value">${fmtQtyD9(item.cantidad)}</div>
          <button class="qty-btn" data-qty="plus" data-id="${esc(item.id)}" type="button">+</button>
          <button class="qty-edit-btn-d9" data-edit-qty="${esc(item.id)}" type="button">Cant.</button>
          <button class="qty-edit-btn-d9 note-item-btn-d9 ${getItemNoteD9(item) ? 'has-note-d9' : ''}" data-edit-note-d9="${esc(item.id)}" type="button" title="Nota del producto" aria-label="Nota del producto">📝</button>
        </div>
        <div class="cart-subtotal-row-d9">
          <span>Subtotal</span>
          <strong class="product-price cart-line-total-d9">${money(item.precio * item.cantidad)}</strong>
        </div>
        ${getItemNoteD9(item) ? `<div class="cart-item-note-d9">${esc(getItemNoteD9(item))}</div>` : ""}
      </div>`).join("");
  }
  syncOrderNoteInputD9();
  $("#summaryItems").textContent = fmtQtyD9(state.cart.reduce((acc, item) => acc + Number(item.cantidad || 0), 0));
  $("#summaryTotal").textContent = money(cartTotal());
  const previewEl = $("#messagePreview");
  if (previewEl) previewEl.textContent = generateMessageText();
}


function buildOrderFingerprint(payload) {
  const cliente = payload?.cliente || {};
  const items = (payload?.carrito || [])
    .map(item => [
      String(item.id || ""),
      String(item.nombre || ""),
      Number(item.cantidad || 0),
      Number(item.precio || 0),
      getItemNoteD9(item)
    ].join(":"))
    .join("|");

  return [
    payload?.vendedor?.id || "",
    cliente.id || cliente.nombre_real || cliente.nombre || "",
    items,
    Number(payload?.total || 0),
    String(payload?.nota_pedido || payload?.notaPedido || "").trim()
  ].join("||");
}


function getRecentOrderSendsD9() {
  const raw = readJSON("d9_recent_order_sends", []);
  return Array.isArray(raw) ? raw : [];
}

function cleanupRecentOrderSendsD9(ttlMs = 120000) {
  const now = Date.now();
  const clean = getRecentOrderSendsD9().filter(x => x && x.fp && Number(x.until || 0) > now);
  saveJSON("d9_recent_order_sends", clean.slice(-20));
  return clean;
}

function isRecentOrderFingerprintBlockedD9(payload, ttlMs = 120000) {
  if (!payload) return false;
  const fp = buildOrderFingerprint(payload);
  const now = Date.now();
  const recent = cleanupRecentOrderSendsD9(ttlMs);
  return recent.some(x => x.fp === fp && Number(x.until || 0) > now);
}

function markRecentOrderFingerprintD9(payload, ttlMs = 120000) {
  if (!payload) return;
  const fp = buildOrderFingerprint(payload);
  const now = Date.now();
  const recent = cleanupRecentOrderSendsD9(ttlMs).filter(x => x.fp !== fp);
  recent.push({ fp, at: now, until: now + ttlMs });
  saveJSON("d9_recent_order_sends", recent.slice(-20));
}

function isOrderSendLocked(payload = null) {
  const now = Date.now();
  if (state.isSending) return true;
  if (state.orderSendLockUntil && now < state.orderSendLockUntil) return true;

  if (payload) {
    const fp = buildOrderFingerprint(payload);
    if (state.lastOrderFingerprint && state.lastOrderFingerprint === fp && now < state.orderSendLockUntil) {
      return true;
    }
  }

  return false;
}

function lockOrderSend(payload, durationMs = 5000) {
  state.isSending = true;
  state.orderSendLockUntil = Date.now() + durationMs;
  state.lastOrderFingerprint = buildOrderFingerprint(payload);
}

function releaseOrderSendLock(delayMs = 1800) {
  setTimeout(() => {
    state.isSending = false;
  }, delayMs);
}



function randomCryptoD9(length = 3) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";

  try {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  } catch (_) {
    for (let i = 0; i < length; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }
}

function nextLocalCounterD9(scope, ownerId) {
  const safeScope = String(scope || "PED").replace(/[^A-Z0-9_]/gi, "_").toUpperCase();
  const safeOwner = String(ownerId || "0").replace(/[^A-Z0-9_-]/gi, "_").toUpperCase();
  const key = `d9_counter_${safeScope}_${safeOwner}`;
  const current = Number(localStorage.getItem(key) || 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem(key, String(next));
  return next.toString(36).toUpperCase();
}

function isLegacyPedidoIdD9(value) {
  const v = String(value || "").trim();
  // Formato viejo vulnerable a colisión: vendedor-random8, ej. 3-6VMPKGK2.
  return /^\d{1,4}-[A-Z0-9]{8}$/i.test(v);
}

function generarPedidoIdD9(vendedorId) {
  const vend = String(vendedorId || "0").replace(/[^A-Z0-9_-]/gi, "").toUpperCase() || "0";
  const counter = nextLocalCounterD9("PED", vend);
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = randomCryptoD9(3);

  // Formato compacto anti-colisión:
  // vendedor-contadorLocal-timestampBase36-randomCrypto
  // Ej: 3-3K-MF8K2P9Q-R7K
  return `${vend}-${counter}-${ts}-${rnd}`;
}

function getDraftPedidoIdD9(vendedorId) {
  const key = "d9_draft_pedido_id";
  let pedidoId = localStorage.getItem(key);

  // Si quedó un borrador viejo con el formato vulnerable, se renueva solo.
  if (!pedidoId || isLegacyPedidoIdD9(pedidoId)) {
    pedidoId = generarPedidoIdD9(vendedorId);
    localStorage.setItem(key, pedidoId);
  }

  return pedidoId;
}

function clearDraftPedidoIdD9() {
  localStorage.removeItem("d9_draft_pedido_id");
}

function regeneratePedidoIdForPayloadD9(payload) {
  const vendedorId = payload?.vendedor?.id || payload?.vendedor_id || state.seller?.id || "0";
  const nuevoId = generarPedidoIdD9(vendedorId);
  if (payload && typeof payload === "object") {
    payload.pedido_id = nuevoId;
    payload.pedidoId = nuevoId;
  }
  return nuevoId;
}


function buildOrderPayload() {
  const vendedorId = state.seller?.id || "0";
  const pedidoId = getDraftPedidoIdD9(vendedorId);

  return {
    pedido_id: pedidoId,
    fecha: new Date().toISOString(),
    vendedor: state.seller,
    cliente: state.selectedClient,
    carrito: state.cart.map(x => ({ id: x.id, nombre: x.nombre, cantidad: x.cantidad, precio: x.precio, nota_item: getItemNoteD9(x) })),
    total: cartTotal(),
    nota_pedido: String(state.orderNoteGeneral || "").trim(),
    detalle: state.cart.map(x => `${x.nombre} x${x.cantidad}${getItemNoteD9(x) ? ` (${getItemNoteD9(x)})` : ""}`).join(" | ")
  };
}

function validateOrder() {
  if (!state.selectedClient) return toast(state.seller?.rol === "cliente" ? "No se encontró el cliente asignado." : "Elegí o cargá un cliente.");
  if (!state.cart.length) return toast("Agregá productos.");
  return true;
}

function buildWebhookPayload(payload) {
  const cliente = payload?.cliente || {};
  const clienteTexto = [
    cliente.nombre_real || cliente.nombre || "",
    cliente.telefono || "",
    cliente.direccion || (cliente.ciudad || "")
  ].filter(Boolean).join(" | ");

  return {
    pedido_id: payload?.pedido_id || payload?.pedidoId || "",
    vendedor_id: payload?.vendedor?.id || "",
    vendedor: payload?.vendedor?.nombre || "",
    cliente: clienteTexto,
    items: (payload?.carrito || []).map(item => ({
      id: item.id || "",
      id_producto: item.id || "",
      nombre: item.nombre,
      cantidad: Number(item.cantidad || 0),
      precio: Number(item.precio || 0),
      nota_item: getItemNoteD9(item)
    })),
    total: Number(payload?.total || 0),
    nota_pedido: String(payload?.nota_pedido || payload?.notaPedido || "").trim(),
    // Se manda para futuras versiones del script. El script actual puede ignorarlo.
    fecha: payload?.fecha || new Date().toISOString(),
    fecha_original: payload?.fecha || "",
    resync_pc: payload?.resync_pc === true
  };
}

async function sendToEndpoint(url, sendPayload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sendPayload)
  });

  let data = null;
  const raw = await r.text();
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }

  if (!r.ok) {
    return { ok: false, status: r.status, error: data?.error || raw || "Error HTTP", data, endpoint: url };
  }

  // Blindaje D9: no alcanza con que el fetch termine.
  // Solo consideramos enviado si el backend responde JSON con ok:true.
  if (!data || data.ok !== true) {
    return { ok: false, status: r.status, error: data?.error || raw || "La PC no confirmó el pedido", data, endpoint: url };
  }

  return { ok: true, data, endpoint: url };
}

function getPedidoIdFromPcRowD9(p) {
  if (!p || typeof p !== "object") return "";

  // La hoja real puede venir como "ID comp.", normalizado por Apps Script como "id_comp.".
  // También soportamos variantes sin punto, nombres nuevos/viejos y diferencias de mayúsculas.
  const directKeys = [
    "pedido_id", "pedidoid", "id_pedido", "id_comp", "id_comp.",
    "id_compra", "id_compra.", "id", "venta_id"
  ];

  for (const k of directKeys) {
    if (p[k]) return String(p[k]).trim();
  }

  // Fallback más robusto: normaliza claves quitando puntos, espacios y símbolos.
  for (const [k, v] of Object.entries(p)) {
    if (!v) continue;
    const key = String(k || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (key === "id_comp" || key === "id_compra" || key === "pedido_id" || key === "id_pedido") {
      return String(v).trim();
    }
    if ((key.includes("pedido") || (key.includes("id") && key.includes("comp"))) && v) {
      return String(v).trim();
    }
  }

  return "";
}

function delayD9(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyPedidoInPcD9(pedidoId, attempts = 3) {
  const id = String(pedidoId || "").trim();
  if (!id) return { ok: false, error: "Pedido sin ID para verificar" };

  let lastError = "La PC no confirmó que el pedido haya quedado cargado";

  for (let intento = 1; intento <= attempts; intento++) {
    try {
      const r = await fetch(`${getApiBaseD9()}?action=list_pedidos&_=${Date.now()}`, { cache: "no-store" });
      const data = await r.json();
      if (!r.ok || data?.ok !== true || !Array.isArray(data.pedidos)) {
        lastError = data?.error || "La PC no devolvió lista de pedidos";
      } else {
        const exists = data.pedidos.some(p => getPedidoIdFromPcRowD9(p) === id);
        if (exists) return { ok: true };
        lastError = "La PC no confirmó que el pedido haya quedado cargado";
      }
    } catch (err) {
      lastError = `No pude verificar en PC: ${String(err)}`;
    }

    if (intento < attempts) await delayD9(700 * intento);
  }

  return { ok: false, error: lastError };
}

async function trySendToWebhook(payload) {
  if (!Array.isArray(WEBHOOK_ENDPOINTS) || !WEBHOOK_ENDPOINTS.length) {
    return { ok: false, error: "Webhook no configurado" };
  }

  let sendPayload = buildWebhookPayload(payload);
  let lastError = null;
  let collisionRetryDone = false;

  async function verifyAfterSendProblemD9(endpoint, errorText) {
    // Caso real detectado: Apps Script puede escribir en PC, pero el navegador perder
    // la confirmación del POST (Failed to fetch / redirect / conexión gris).
    // Antes de declarar "No llegó a PC", verificamos por ID.
    try {
      const verify = await verifyPedidoInPcD9(sendPayload.pedido_id, 3);
      if (verify?.ok) {
        return {
          ok: true,
          endpoint,
          data: {
            ok: true,
            duplicated: true,
            pedido_id: sendPayload.pedido_id,
            verified_after_error: true,
            message: "El pedido ya estaba cargado en PC. Se corrigió el estado local."
          }
        };
      }
      return { ok: false, error: verify?.error || errorText || "No confirmado en PC", endpoint };
    } catch (verifyErr) {
      return { ok: false, error: errorText || String(verifyErr), endpoint };
    }
  }

  for (const endpoint of WEBHOOK_ENDPOINTS) {
    try {
      let result = await sendToEndpoint(endpoint, sendPayload);

      // Defensa anti-colisión:
      // si el backend avisa que el ID ya existe pero pertenece a otro pedido,
      // regeneramos ID una sola vez y reenviamos. No lo marcamos como "ya cargado".
      if (!result?.ok && result?.data?.error_code === "ERROR_COLISION_ID" && !collisionRetryDone) {
        collisionRetryDone = true;
        const oldId = sendPayload.pedido_id;
        const newId = regeneratePedidoIdForPayloadD9(payload);
        sendPayload = buildWebhookPayload(payload);
        console.warn(`[D9] Colisión de ID detectada (${oldId}). Reintentando con ${newId}.`);
        result = await sendToEndpoint(endpoint, sendPayload);
      }

      if (result?.ok) {
        const verify = await verifyPedidoInPcD9(sendPayload.pedido_id);
        if (verify.ok) return result;
        lastError = { ok: false, error: verify.error || "No confirmado en PC", endpoint, data: result.data };
      } else {
        // Aunque el POST haya vuelto raro/no confirmado, puede haber escrito en PC.
        // Si el backend confirmó colisión, NO verificamos por el ID viejo porque pertenece a otro pedido.
        if (result?.data?.error_code === "ERROR_COLISION_ID") {
          lastError = { ok: false, error: result?.error || "ID repetido con otro pedido. Reenviá para generar ID nuevo.", endpoint, data: result.data };
        } else {
          lastError = await verifyAfterSendProblemD9(endpoint, result?.error || `Fallo en ${endpoint}`);
          if (lastError?.ok) return lastError;
        }
      }
    } catch (error) {
      lastError = await verifyAfterSendProblemD9(endpoint, String(error));
      if (lastError?.ok) return lastError;
    }
  }

  return lastError || { ok: false, error: "No se pudo enviar el pedido" };
}

function saveHistory(payload, status = "enviado", error = "") {
  const history = readJSON(STORAGE_KEYS.history, []);
  const pedidoId = String(payload?.pedido_id || payload?.pedidoId || "").trim();
  const existingIndex = pedidoId ? history.findIndex(x => String(x.pedido_id || "").trim() === pedidoId) : -1;
  const entry = {
    id: pedidoId || `${payload.fecha}_${payload.cliente?.id || payload.cliente?.nombre_real || payload.cliente?.nombre || "pedido"}_${Math.random().toString(36).slice(2, 8)}`,
    pedido_id: pedidoId,
    fecha: payload.fecha,
    vendedor: payload.vendedor?.nombre || "",
    vendedor_id: payload.vendedor?.id || "",
    cliente: payload.cliente?.nombre_real || payload.cliente?.nombre || "",
    cliente_id: payload.cliente?.id || "",
    cliente_data: payload.cliente || null,
    detalle: payload.detalle,
    total: payload.total,
    nota_pedido: String(payload?.nota_pedido || payload?.notaPedido || "").trim(),
    status,
    pc_status: status === "ok" ? "cargado" : "pendiente",
    whatsapp_status: "enviado",
    items: (payload.carrito || []).map(x => ({
      id: x.id,
      nombre: x.nombre,
      cantidad: x.cantidad,
      precio: x.precio,
      nota_item: getItemNoteD9(x),
      subtotal: Number(x.precio || 0) * Number(x.cantidad || 0)
    })),
    error
  };
  if (existingIndex >= 0) history[existingIndex] = { ...history[existingIndex], ...entry };
  else history.unshift(entry);
  saveJSON(STORAGE_KEYS.history, history.slice(0, 300));
  renderHistory();
  renderMostradorRoleD9();
  renderMostradorD9();
}

function savePendingPayload(payload) {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  const pedidoId = String(payload?.pedido_id || payload?.pedidoId || "").trim();
  if (pedidoId && pending.some(x => String(x?.pedido_id || x?.pedidoId || "").trim() === pedidoId)) {
    refreshPendingUiD9();
    schedulePendingHomeRefreshD9();
    return;
  }
  pending.push(payload);
  saveJSON(STORAGE_KEYS.pending, pending);
  refreshPendingUiD9();
  schedulePendingHomeRefreshD9();
}

function updateHistoryStatusByPedidoIdD9(pedidoId, status, error = "") {
  const id = String(pedidoId || "").trim();
  if (!id) return;
  const history = readJSON(STORAGE_KEYS.history, []);
  let changed = false;
  const next = history.map(item => {
    if (String(item.pedido_id || item.id || "").trim() !== id) return item;
    changed = true;
    return { ...item, status, pc_status: status === "ok" ? "cargado" : "pendiente", error };
  });
  if (changed) {
    saveJSON(STORAGE_KEYS.history, next);
    renderHistory();
  }
}
function pendingPayloadMatchesD9(a, b) {
  const idA = String(a?.pedido_id || a?.pedidoId || "").trim();
  const idB = String(b?.pedido_id || b?.pedidoId || "").trim();
  if (idA && idB && idA === idB) return true;

  const fpA = safePedidoFingerprintD9(a);
  const fpB = safePedidoFingerprintD9(b);
  return !!(fpA && fpB && fpA === fpB);
}

function isHistoryResolvedForPendingD9(payload) {
  const history = readJSON(STORAGE_KEYS.history, []);
  return history.some(item => {
    const status = String(item?.status || "").trim().toLowerCase();
    const pcStatus = String(item?.pc_status || "").trim().toLowerCase();
    const isOk = status === "ok" || pcStatus === "cargado";
    if (!isOk || isHistoryItemDuplicadoAdvertenciaD9(item) || isHistoryItemAnuladoD9(item)) return false;

    const itemPayload = buildPayloadFromHistoryItemD9(item);
    if (itemPayload?.ok && pendingPayloadMatchesD9(payload, itemPayload)) return true;

    const idA = String(payload?.pedido_id || payload?.pedidoId || "").trim();
    const idB = String(item?.pedido_id || item?.pedidoId || item?.id || "").trim();
    return !!(idA && idB && idA === idB);
  });
}

function removePendingRelatedToPayloadD9(payload, reason = "resuelto") {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  if (!Array.isArray(pending) || !pending.length || !payload) return 0;

  const next = [];
  let removed = 0;
  for (const item of pending) {
    if (pendingPayloadMatchesD9(item, payload)) {
      removed++;
      continue;
    }
    next.push(item);
  }

  if (removed) {
    saveJSON(STORAGE_KEYS.pending, next);
    refreshPendingUiD9();
    schedulePendingHomeRefreshD9();
    logAppEventD9("PENDIENTE_LIMPIADO_REENVIO_OK", { payload, resultado: "ok", detalle: `${reason}: ${removed}` });
  }
  return removed;
}


function looksLikePedidoIdD9(value) {
  const v = String(value || "").trim();
  // Formato normal actual: vendedorId-CODIGO8, ej: 3-ZWKPU34J o 10-RH7738G6.
  if (/^\d{1,4}-[A-Z0-9]{6,12}$/i.test(v)) return true;
  // Fallback para historiales viejos ya guardados con otro formato local.
  // No genera ID nuevo: si existe un ID local estable, lo reutilizamos para que no duplique al segundo intento.
  if (/^[A-Za-z0-9_-]{6,40}$/.test(v) && !v.includes(" ")) return true;
  return false;
}


function isHistoryItemAnuladoD9(item) {
  const estado = String(item?.estado || item?.pc_estado || "").trim().toUpperCase();
  return estado === "ANULADO" || estado === "ANULADO_VENDEDOR" || estado.includes("ANULADO");
}

function isHistoryItemDuplicadoAdvertenciaD9(item) {
  const status = String(item?.status || item?.pc_status || "").trim().toLowerCase();
  const err = String(item?.error || item?.detalle_estado || "").trim().toLowerCase();
  return status === "duplicado_warning"
    || status === "posible_duplicado"
    || err.includes("posible duplicado")
    || err.includes("no enviado a pc");
}

function duplicateWarningTextD9() {
  return "⚠️ No enviado a PC: posible duplicado";
}

function setHistoryItemAnuladoD9(itemId, pedidoId, message = "ANULADO_VENDEDOR") {
  const history = readJSON(STORAGE_KEYS.history, []);
  const targetItemId = String(itemId || "").trim();
  const targetPedidoId = String(pedidoId || "").trim();

  const updated = history.map(item => {
    const localId = String(item.id || item.pedido_id || item.pedidoId || "").trim();
    const localPedidoId = String(item.pedido_id || item.pedidoId || "").trim();
    const match = (targetPedidoId && localPedidoId === targetPedidoId) || (targetItemId && localId === targetItemId);
    if (!match) return item;
    return {
      ...item,
      estado: "ANULADO_VENDEDOR",
      pc_estado: "ANULADO_VENDEDOR",
      status: "ok",
      pc_status: "cargado",
      error: message || "Anulado en PC"
    };
  });

  saveJSON(STORAGE_KEYS.history, updated);
}

function buildActionUrlD9(endpoint, action) {
  const url = String(endpoint || "").trim();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}action=${encodeURIComponent(action)}`;
}

async function postD9Action(action, payload = {}) {
  if (!Array.isArray(WEBHOOK_ENDPOINTS) || !WEBHOOK_ENDPOINTS.length) {
    return { ok: false, error: "Webhook no configurado" };
  }

  let last = null;
  for (const endpoint of WEBHOOK_ENDPOINTS) {
    try {
      const result = await sendToEndpoint(buildActionUrlD9(endpoint, action), { ...payload, action });
      if (result?.ok) return result;
      last = result;
    } catch (err) {
      last = { ok: false, error: String(err), endpoint };
    }
  }
  return last || { ok: false, error: "No se pudo completar la acción" };
}

async function anularHistoryPedidoD9(id) {
  const history = readJSON(STORAGE_KEYS.history, []);
  const item = history.find(x => String(x.id || x.pedido_id || x.pedidoId || "") === String(id));
  if (!item) return toast("No encontré el pedido en historial.");

  const pedidoId = getHistoryPedidoIdD9(item);
  if (!pedidoId) return toast("No encontré el ID interno del pedido.");

  if (isHistoryItemAnuladoD9(item)) {
    toast("Ese pedido ya figura anulado.");
    return;
  }

  const pcText = item.pc_status === "cargado" || item.status === "ok" ? "Cargado en PC" : "No llegó a PC";
  if (pcText !== "Cargado en PC") {
    toast("Solo se pueden anular pedidos cargados en PC.");
    return;
  }

  showD9Confirm({
    message: "¿Anular este pedido en PC?",
    detail: "No se borra de Sheets: se marca como ANULADO_VENDEDOR y queda como registro administrativo.",
    okText: "Anular",
    cancelText: "Cancelar",
    onOk: async () => {
      const res = await postD9Action("anular_pedido", {
        pedido_id: pedidoId,
        vendedor_id: item.vendedor_id || state.seller?.id || "",
        vendedor: item.vendedor || state.seller?.nombre || ""
      });

      if (!res?.ok || res?.data?.ok !== true) {
        logAppEventD9("PEDIDO_ANULADO_ERROR", { pedido_id: pedidoId, cliente: item.cliente, total: item.total, resultado: "error", error: res?.data?.error || res?.error || "No se pudo anular en PC" });
        toast(res?.data?.error || res?.error || "No se pudo anular en PC.");
        return;
      }

      setHistoryItemAnuladoD9(id, pedidoId, "Anulado en PC");
      logAppEventD9("PEDIDO_ANULADO", { pedido_id: pedidoId, cliente: item.cliente, total: item.total, resultado: "ok", detalle: `${res.data.filas || 0} filas` });
      renderHistory();
      toast(`Pedido anulado en PC (${res.data.filas || 0} filas).`);
    }
  });
}

function getHistoryPedidoIdD9(item) {
  const pedidoId = String(item?.pedido_id || item?.pedidoId || item?.id_pedido || "").trim();
  if (pedidoId) return pedidoId;
  const id = String(item?.id || "").trim();
  if (looksLikePedidoIdD9(id)) return id;
  return "";
}


function hashManualPedidoIdD9(value) {
  const text = String(value || "manual");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 8).padStart(6, "0");
}

function inferVendedorIdFromHistoryD9(item) {
  const direct = String(item?.vendedor_id || item?.vendedorId || "").trim();
  if (direct) return direct;

  // Algunos historiales viejos guardaban algo tipo fecha_5_xxxxx.
  const rawId = String(item?.id || "").trim();
  const parts = rawId.split("_");
  const maybe = parts.find(part => /^\d{1,4}$/.test(part));
  if (maybe) return maybe;

  return String(state?.seller?.id || "0").trim();
}

function getManualPedidoIdD9(item) {
  // ID estable: no es el ID comp. original, pero permite cargar manual sin duplicar al segundo intento.
  const base = String(item?.id || `${item?.fecha || ""}_${item?.cliente || ""}_${item?.total || ""}` || Date.now()).trim();
  const vendedorId = inferVendedorIdFromHistoryD9(item) || "0";
  return `MAN-${vendedorId}-${hashManualPedidoIdD9(base)}`;
}

function updateHistoryItemByLocalIdD9(localId, patch) {
  const id = String(localId || "").trim();
  if (!id) return;
  const history = readJSON(STORAGE_KEYS.history, []);
  let changed = false;
  const next = history.map(item => {
    const itemId = String(item.id || item.pedido_id || item.pedidoId || "").trim();
    if (itemId !== id) return item;
    changed = true;
    return { ...item, ...patch };
  });
  if (changed) {
    saveJSON(STORAGE_KEYS.history, next);
    renderHistory();
    renderPendingBadge();
  }
}

function buildManualPayloadFromHistoryItemD9(item) {
  const items = Array.isArray(item?.items) ? item.items : [];
  if (!items.length) {
    return { ok: false, error: "Este registro no tiene productos completos para cargar manualmente." };
  }

  const pedidoId = getManualPedidoIdD9(item);
  const vendedorId = inferVendedorIdFromHistoryD9(item);
  const clienteData = item?.cliente_data || {
    id: item?.cliente_id || "",
    nombre: item?.cliente || "",
    nombre_real: item?.cliente || ""
  };

  return {
    ok: true,
    pedido_id: pedidoId,
    fecha: item?.fecha || new Date().toISOString(),
    vendedor: { id: vendedorId || "", nombre: item?.vendedor || state.seller?.nombre || "" },
    cliente: clienteData,
    carrito: items.map(x => ({
      id: x.id || x.id_producto || "",
      nombre: x.nombre || "",
      cantidad: Number(x.cantidad || 0),
      precio: Number(x.precio || 0),
      nota_item: getItemNoteD9(x)
    })),
    total: Number(item?.total || 0),
    nota_pedido: String(item?.nota_pedido || item?.notaPedido || "").trim(),
    detalle: item?.detalle || items.map(x => `${x.nombre || "Producto"} x${x.cantidad || 0}${getItemNoteD9(x) ? ` (${getItemNoteD9(x)})` : ""}`).join(" | "),
    resync_pc: true,
    carga_manual_pc: true
  };
}

async function manualLoadHistoryItemsToPcD9(ids) {
  const selectedIds = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!selectedIds.length) return toast("Seleccioná al menos un pedido.");
  if (!navigator.onLine) return toast("Sin conexión. Probá cuando tengas internet.");

  const history = readJSON(STORAGE_KEYS.history, []);
  const selected = history.filter(item => selectedIds.includes(String(item.id || item.pedido_id || item.pedidoId || "")));
  if (!selected.length) return toast("No encontré esos pedidos en historial.");

  const msg = selected.length === 1
    ? "Este pedido no tiene ID original. Se cargará manualmente en PC con un ID nuevo estable (MAN-...). ¿Continuar?"
    : `${selected.length} pedidos se cargarán manualmente en PC con ID nuevo estable (MAN-...). ¿Continuar?`;
  if (!confirm(msg)) return;

  let ok = 0;
  let already = 0;
  let fail = 0;

  for (const item of selected) {
    const localId = String(item.id || item.pedido_id || item.pedidoId || "").trim();
    const payload = buildManualPayloadFromHistoryItemD9(item);
    if (!payload?.ok) {
      fail++;
      if (localId) updateHistoryItemByLocalIdD9(localId, { status: "pendiente", pc_status: "pendiente", error: payload?.error || "No se pudo cargar manualmente" });
      continue;
    }

    try {
      const exists = await verifyPedidoInPcD9(payload.pedido_id, 2);
      if (exists?.ok) {
        already++;
        updateHistoryItemByLocalIdD9(localId, {
          pedido_id: payload.pedido_id,
          status: "ok",
          pc_status: "cargado",
          error: "Carga manual: ya recibido previamente"
        });
        removePendingRelatedToPayloadD9(payload, "carga manual ya estaba en PC");
        continue;
      }

      const res = await trySendToWebhook(payload);
      if (res?.ok) {
        ok++;
        logAppEventD9(res?.data?.duplicated ? "REENVIO_HISTORIAL_WARNING" : "REENVIO_HISTORIAL_OK", { payload, resultado: res?.data?.duplicated ? "posible_duplicado" : "ok", detalle: res?.data?.duplicated ? duplicateWarningTextD9() : "" });
        updateHistoryItemByLocalIdD9(localId, {
          pedido_id: payload.pedido_id,
          vendedor_id: payload.vendedor?.id || item.vendedor_id || "",
          status: res?.data?.duplicated ? "duplicado_warning" : "ok",
          pc_status: res?.data?.duplicated ? "pendiente" : "cargado",
          error: res?.data?.duplicated ? duplicateWarningTextD9() : "Cargado manualmente en PC"
        });
        if (!res?.data?.duplicated) removePendingRelatedToPayloadD9(payload, "carga manual OK");
      } else {
        fail++;
        logAppEventD9("REENVIO_HISTORIAL_ERROR", { payload, resultado: "error", error: res?.error || "No llegó a PC" });
        updateHistoryItemByLocalIdD9(localId, {
          pedido_id: payload.pedido_id,
          vendedor_id: payload.vendedor?.id || item.vendedor_id || "",
          status: "pendiente",
          pc_status: "pendiente",
          error: res?.error || "No llegó a PC"
        });
        savePendingPayload(payload);
      }
    } catch (err) {
      fail++;
      updateHistoryItemByLocalIdD9(localId, {
        pedido_id: payload.pedido_id,
        status: "pendiente",
        pc_status: "pendiente",
        error: String(err)
      });
      savePendingPayload(payload);
    }
  }

  renderPendingBadge();
  if ((ok || already) && !fail) {
    const parts = [];
    if (ok) parts.push(ok === 1 ? "1 cargado manualmente" : `${ok} cargados manualmente`);
    if (already) parts.push(already === 1 ? "1 ya estaba en PC" : `${already} ya estaban en PC`);
    toast(parts.join(" · "));
  } else if ((ok || already) && fail) {
    toast(`OK ${ok + already}. Fallaron ${fail}.`);
  } else {
    toast("No se pudo cargar manualmente en PC.");
  }
}


function debugHistoryItemD9(item, payloadResult = null) {
  const rawId = String(item?.id || "").trim();
  const pedidoId = getHistoryPedidoIdD9(item);
  const items = Array.isArray(item?.items) ? item.items : [];
  const carrito = payloadResult?.ok && Array.isArray(payloadResult.carrito) ? payloadResult.carrito : [];
  const keys = item && typeof item === "object" ? Object.keys(item).slice(0, 30).join(", ") : "sin objeto";
  return [
    "DEBUG REENVIAR A PC",
    `ID detectado: ${pedidoId || "NO"}`,
    `item.id: ${rawId || "NO"}`,
    `item.pedido_id: ${item?.pedido_id || "NO"}`,
    `item.pedidoId: ${item?.pedidoId || "NO"}`,
    `items en historial: ${items.length}`,
    `carrito armado: ${carrito.length}`,
    `cliente: ${item?.cliente || "NO"}`,
    `vendedor: ${item?.vendedor || "NO"}`,
    `vendedor_id: ${item?.vendedor_id || "NO"}`,
    `total: ${item?.total || "NO"}`,
    `endpoint(s): ${(Array.isArray(WEBHOOK_ENDPOINTS) ? WEBHOOK_ENDPOINTS.length : 0)}`,
    `claves: ${keys}`,
    payloadResult?.ok ? "payload: OK" : `payload error: ${payloadResult?.error || "NO"}`
  ].join("\n");
}

function showResyncDebugD9(item, payloadResult = null, stage = "inicio") {
  const text = `${stage.toUpperCase()}\n${debugHistoryItemD9(item, payloadResult)}`;
  console.log(text, { item, payloadResult, stage });
  try {
    alert(text);
  } catch (_) {
    toast(text.split("\n").slice(0, 3).join(" · "));
  }
}

function buildPayloadFromHistoryItemD9(item) {
  const pedidoId = getHistoryPedidoIdD9(item);
  if (!pedidoId) {
    return { ok: false, error: "Este registro no tiene ID original. Usá Reutilizar o cargalo manualmente para evitar duplicados." };
  }
  const clienteData = item?.cliente_data || {
    id: item?.cliente_id || "",
    nombre: item?.cliente || "",
    nombre_real: item?.cliente || ""
  };
  return {
    ok: true,
    pedido_id: pedidoId,
    fecha: item?.fecha || new Date().toISOString(),
    vendedor: { id: item?.vendedor_id || state.seller?.id || "", nombre: item?.vendedor || state.seller?.nombre || "" },
    cliente: clienteData,
    carrito: (item?.items || []).map(x => ({ id: x.id || "", nombre: x.nombre || "", cantidad: Number(x.cantidad || 0), precio: Number(x.precio || 0), nota_item: getItemNoteD9(x) })),
    total: Number(item?.total || 0),
    nota_pedido: String(item?.nota_pedido || item?.notaPedido || "").trim(),
    detalle: item?.detalle || "",
    resync_pc: true
  };
}

async function resyncHistoryItemsToPcD9(ids) {
  const selectedIds = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!selectedIds.length) return toast("Seleccioná al menos un pedido.");
  if (!navigator.onLine) return toast("Sin conexión. Probá cuando tengas internet.");

  const history = readJSON(STORAGE_KEYS.history, []);
  const selected = history.filter(item => selectedIds.includes(String(item.id || item.pedido_id || item.pedidoId || "")));
  if (!selected.length) return toast("No encontré esos pedidos en historial.");

  let ok = 0;
  let already = 0;
  let fail = 0;
  let skipped = 0;
  for (const item of selected) {
    const itemId = String(item.id || item.pedido_id || item.pedidoId || "").trim();
    const pedidoIdOriginal = getHistoryPedidoIdD9(item);
    const lockKey = pedidoIdOriginal || itemId;

    if (lockKey && d9HistoryResyncLocks.has(lockKey)) {
      skipped++;
      continue;
    }

    if (item.pc_status === "cargado" || item.status === "ok") {
      already++;
      continue;
    }

    if (lockKey) d9HistoryResyncLocks.add(lockKey);

    const payload = buildPayloadFromHistoryItemD9(item);
    if (!payload?.ok) {
      fail++;
      if (lockKey) d9HistoryResyncLocks.delete(lockKey);
      toast(payload?.error || "No pude armar el pedido para reenviar.");
      continue;
    }
    if (!payload.carrito.length) {
      fail++;
      if (lockKey) d9HistoryResyncLocks.delete(lockKey);
      updateHistoryStatusByPedidoIdD9(payload.pedido_id, "pendiente", "Registro sin detalle de productos");
      toast("No pude reenviar: el historial no tiene productos completos.");
      continue;
    }

    try {
      // Primero verificamos. Si ya está en PC, NO hacemos POST y evitamos duplicados.
      const exists = await verifyPedidoInPcD9(payload.pedido_id);
      if (exists?.ok) {
        already++;
        updateHistoryStatusByPedidoIdD9(payload.pedido_id, "ok", "Ya recibido previamente");
        removePendingRelatedToPayloadD9(payload, "historial ya estaba en PC");
        continue;
      }

      const res = await trySendToWebhook(payload);
      if (res?.ok) {
        ok++;
        if (res?.data?.duplicated) {
          const warn = duplicateWarningTextD9();
          logAppEventD9("REENVIO_HISTORIAL_WARNING", { payload, resultado: "posible_duplicado", detalle: warn });
          updateHistoryStatusByPedidoIdD9(payload.pedido_id, "duplicado_warning", warn);
        } else {
          logAppEventD9("REENVIO_HISTORIAL_OK", { payload, resultado: "ok" });
          updateHistoryStatusByPedidoIdD9(payload.pedido_id, "ok", "Reenviado a PC");
          removePendingRelatedToPayloadD9(payload, "reenviado manual OK");
        }
      } else {
        fail++;
        updateHistoryStatusByPedidoIdD9(payload.pedido_id, "pendiente", res?.error || "No llegó a PC");
        savePendingPayload(payload);
      }
    } catch (err) {
      fail++;
      updateHistoryStatusByPedidoIdD9(payload.pedido_id, "pendiente", String(err));
      savePendingPayload(payload);
    } finally {
      if (lockKey) d9HistoryResyncLocks.delete(lockKey);
    }
  }
  renderPendingBadge();
  if ((ok || already) && !fail) {
    const parts = [];
    if (ok) parts.push(ok === 1 ? "1 reenviado" : `${ok} reenviados`);
    if (already) parts.push(already === 1 ? "1 ya estaba en PC" : `${already} ya estaban en PC`);
    if (skipped) parts.push(`${skipped} en proceso`);
    toast(parts.join(" · "));
  } else if ((ok || already) && fail) {
    toast(`OK ${ok + already}. Fallaron ${fail}.`);
  } else if (skipped && !fail) {
    toast("Ese reenvío ya está en proceso.");
  } else {
    toast("No se pudo reenviar a PC. Quedó pendiente.");
  }
}

async function sendOrder() {
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) return;
  if (validateOrder() !== true) return;

  const payload = buildOrderPayload();
  logAppEventD9("CONFIRMAR_ENVIO_TOCADO", { payload, resultado: "tap" });

  if (isOrderSendLocked(payload)) {
    logAppEventD9("ENVIO_BLOQUEADO_LOCK", { payload, resultado: "bloqueado", detalle: "isOrderSendLocked" });
    return;
  }

  // D9 v1.3.17: candado persistente por huella de pedido.
  // Evita que el mismo cliente + mismos productos + mismo total se cargue dos veces
  // si Android vuelve de WhatsApp, se repite un tap, o queda un reintento viejo dando vueltas.
  if (isRecentOrderFingerprintBlockedD9(payload, 120000)) {
    logAppEventD9("ANTI_DUPLICADO_BLOQUEO", { payload, resultado: "bloqueado", detalle: "fingerprint reciente" });
    toast("Este mismo pedido ya se envió hace instantes. Esperá un momento para repetirlo.");
    return;
  }

  lockOrderSend(payload, 15000);

  const sendBtn = $("#btnSend");
  const pendingBtn = $("#btnSyncPending");
  const confirmBtn = $("#btnConfirmOrderSend");

  setButtonBusy(sendBtn, true, "Enviando...", "Enviar pedido");
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando...";
  }

  try {
    const defaultWa = getDefaultWhatsAppD9();

    // WhatsApp destino libre por usuario logueado:
    // si el usuario tiene wasap_report, se usa sin importar el rol.
    // Si no tiene, cae al WhatsApp general de confi.
    const userWaReport = String(state.seller?.wasap_report || "").trim();
    const waPhone = userWaReport || defaultWa;
    const waText = generateMessageText(payload);

    if (!navigator.onLine) {
      savePendingPayload(payload);
      logAppEventD9("PENDIENTE_CREADO", { payload, resultado: "sin_conexion", detalle: "Modo offline al enviar" });
      saveHistory(payload, "pendiente", "Sin conexión");
      clearDraftPedidoIdD9();
      refreshPendingUiD9();
      schedulePendingHomeRefreshD9();
      toast("Sin internet. Pedido guardado pendiente.");
      if (pendingBtn) pulseSuccess(pendingBtn, "Pendiente guardado", "Se enviará al recuperar conexión");
      return;
    }

    if (!openWhatsApp(waPhone, waText)) {
      logAppEventD9("WHATSAPP_ERROR", { payload, resultado: "error", detalle: "Falta WhatsApp destino" });
      toast("Falta WhatsApp destino en confi.");
      return;
    }

    logAppEventD9("WHATSAPP_ABIERTO", { payload, resultado: "ok", detalle: waPhone ? `destino:${waPhone}` : "sin destino" });
    markRecentOrderFingerprintD9(payload, 120000);

    trySendToWebhook(payload)
      .then(res => {
        if (!res || !res.ok) {
          savePendingPayload(payload);
          logAppEventD9("PEDIDO_ENVIADO_SHEETS_ERROR", { payload, resultado: "pendiente", error: res?.error || "No pude confirmar el envío" });
          saveHistory(payload, "pendiente", res?.error || "No pude confirmar el envío");
          // IMPORTANTE: el pedido ya salió por WhatsApp y quedó guardado con su ID.
          // Limpiamos el borrador para que el próximo pedido NO reutilice el mismo ID.
          clearDraftPedidoIdD9();
          refreshPendingUiD9();
          schedulePendingHomeRefreshD9();
          console.warn("Pedido pendiente:", res?.error);
        } else {
          if (res?.data?.duplicated) {
            const warn = duplicateWarningTextD9();
            logAppEventD9("PEDIDO_ENVIADO_SHEETS_WARNING", { payload, resultado: "posible_duplicado", detalle: warn });
            saveHistory(payload, "duplicado_warning", warn);
            toast(warn);
          } else {
            logAppEventD9("PEDIDO_ENVIADO_SHEETS_OK", { payload, resultado: "ok", detalle: res?.data?.message || "Enviado correctamente" });
            saveHistory(payload, "ok", "Enviado correctamente");
          }
          clearDraftPedidoIdD9();
          refreshPendingUiD9();
          schedulePendingHomeRefreshD9();
        }
      })
      .catch(err => {
        savePendingPayload(payload);
        logAppEventD9("PEDIDO_ENVIADO_SHEETS_ERROR", { payload, resultado: "catch", error: String(err) });
        saveHistory(payload, "pendiente", String(err));
        // También en error total: el próximo pedido debe nacer con ID nuevo.
        clearDraftPedidoIdD9();
        refreshPendingUiD9();
        schedulePendingHomeRefreshD9();
        console.error("Error total, guardado local:", err);
      });

    pulseSuccess(sendBtn, "Enviado");
  } finally {
    if (state.seller?.rol === "cliente") {
      applyUserContext();
    } else if (!state.seller) {
      state.selectedClient = state.guestClientDraft || state.selectedClient;
    } else {
      state.selectedClient = null;
    }

    clearCart();
    renderSelectedClient();
    renderClients();

    setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");

    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirmar y enviar";
    }

    releaseOrderSendLock(5000);
  }
}


function savePendingNow() {
  // D9 v1.3.33: el guardado manual como pendiente queda legacy.
  // Los pendientes ahora se generan solamente si falla el envío real.
  return saveDraftNowD9();
}

function getDraftsD9() {
  return readJSON(STORAGE_KEYS.drafts, []);
}

function saveDraftsD9(items) {
  saveJSON(STORAGE_KEYS.drafts, Array.isArray(items) ? items.slice(0, 100) : []);
}

function makeDraftIdD9() {
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `draft_${Date.now().toString(36)}_${rnd}`;
}

function saveDraftNowD9() {
  if (validateOrder() !== true) return;

  const payload = buildOrderPayload();
  const draft = {
    ...payload,
    draft_id: makeDraftIdD9(),
    tipo_local: "BORRADOR",
    fecha_guardado: new Date().toISOString(),
    activePriceList: state.activePriceList || "lista_1",
    manualPriceOverride: !!state.manualPriceOverride
  };

  const drafts = getDraftsD9().filter(x => x && x.draft_id !== draft.draft_id);
  drafts.unshift(draft);
  saveDraftsD9(drafts);
  logAppEventD9("GUARDAR_BORRADOR", { payload, pedido_id: draft.draft_id, resultado: "ok", detalle: `items:${(draft.carrito || []).length} notas:${(draft.carrito || []).filter(x => getItemNoteD9(x)).length}${draft.nota_pedido ? " nota_pedido" : ""}` });

  // El borrador NO es pedido enviado y NO debe arrastrar el mismo ID al próximo pedido.
  clearDraftPedidoIdD9();

  if (state.seller?.rol === "cliente") {
    applyUserContext();
  } else if (!state.seller) {
    state.selectedClient = state.guestClientDraft || state.selectedClient;
  } else {
    state.selectedClient = null;
  }
  clearCart();
  renderSelectedClient();
  renderClients();
  refreshPendingUiD9();
  schedulePendingHomeRefreshD9();
  toast("Borrador guardado. No se enviará automáticamente.");
}

function pendingClienteNameD9(item) {
  const c = item?.cliente || {};
  return c.nombre_real || c.nombre || item?.cliente_nombre || "Cliente";
}

function itemDateLabelD9(value) {
  try { return new Date(value || Date.now()).toLocaleString("es-AR"); } catch { return ""; }
}

function pendingProductsPreviewHtmlD9(item) {
  const cart = Array.isArray(item?.carrito) ? item.carrito : (Array.isArray(item?.items) ? item.items : []);
  if (!cart.length) return "";
  const rows = cart.map(x => {
    const name = x?.nombre || x?.detalle || x?.producto || x?.id || "Producto";
    const qty = Number(x?.cantidad || x?.cant || 1);
    const price = Number(x?.precio || x?.precio_unitario || 0);
    const note = getItemNoteD9(x);
    return `<li>
      <span class="pending-product-name-d9">${esc(name)}${note ? `<em>Nota: ${esc(note)}</em>` : ""}</span>
      <span class="pending-product-side-d9">x${esc(fmtQtyD9(qty))} · ${money(price * qty)}</span>
    </li>`;
  }).join("");
  const notePedido = String(item?.nota_pedido || item?.notaPedido || "").trim();
  return `<details class="pending-products-d9">
    <summary>Ver productos (${cart.length})</summary>
    ${notePedido ? `<div class="pending-note-order-d9">Nota pedido: ${esc(notePedido)}</div>` : ""}
    <ul>${rows}</ul>
  </details>`;
}

function renderPendingAndDraftsD9() {
  const list = $("#pendingWorkListD9");
  if (!list) return;

  const pending = readJSON(STORAGE_KEYS.pending, []);
  const drafts = getDraftsD9();
  renderPendingBadge();

  if (!pending.length && !drafts.length) {
    list.className = "history-list empty-state";
    list.textContent = "No hay pendientes ni borradores en espera.";
    return;
  }

  list.className = "history-list pending-drafts-list-d9";

  const pendingHtml = pending.length ? `
    <div class="pending-drafts-section-d9">
      <div class="pending-drafts-title-d9">
        <strong>⚠️ Pendientes de envío</strong>
        <span>${pending.length}</span>
      </div>
      <p class="mini-text pending-drafts-help-d9">Pedidos que salieron o intentaron salir, pero todavía no quedaron confirmados en la PC.</p>
      <button id="btnRetryPendingD9" class="history-action-btn history-action-main-d9 pending-retry-main-d9" type="button">📤 Enviar pendientes a PC</button>
      ${pending.map(item => `
        <div class="pending-draft-item-d9 pending-auto-d9">
          <div class="pending-draft-main-d9">
            <strong>${esc(pendingClienteNameD9(item))}</strong>
            <div class="mini-text">${esc(itemDateLabelD9(item?.fecha))}</div>
            <div class="mini-text">ID: ${esc(item?.pedido_id || item?.pedidoId || "sin ID")}${item?.error ? " · " + esc(item.error) : ""}</div>
            ${pendingProductsPreviewHtmlD9(item)}
          </div>
          <div class="pending-draft-side-d9">${money(Number(item?.total || 0))}</div>
        </div>`).join("")}
    </div>` : "";

  const draftsHtml = drafts.length ? `
    <div class="pending-drafts-section-d9">
      <div class="pending-drafts-title-d9">
        <strong>📝 Borradores en espera</strong>
        <span>${drafts.length}</span>
      </div>
      <p class="mini-text pending-drafts-help-d9">Guardados manualmente. No se envían solos. Hay que continuarlos, revisar y enviar por WhatsApp.</p>
      ${drafts.map(item => `
        <div class="pending-draft-item-d9 draft-waiting-d9">
          <div class="pending-draft-main-d9">
            <strong>${esc(pendingClienteNameD9(item))}</strong>
            <div class="mini-text">Guardado: ${esc(itemDateLabelD9(item?.fecha_guardado || item?.fecha))}</div>
            <div class="mini-text">${esc((item?.carrito || []).length)} producto${(item?.carrito || []).length === 1 ? "" : "s"} · ${money(Number(item?.total || 0))}</div>
            <div class="history-actions history-actions-compact-d9" data-no-toggle>
              <button class="history-action-btn history-action-main-d9" data-continue-draft-d9="${esc(item.draft_id)}" type="button">Continuar</button>
              <button class="history-delete-btn" data-delete-draft-d9="${esc(item.draft_id)}" type="button">🗑️</button>
            </div>
          </div>
        </div>`).join("")}
    </div>` : "";

  list.innerHTML = pendingHtml + draftsHtml;
}

function continueDraftD9(draftId) {
  const drafts = getDraftsD9();
  const draft = drafts.find(x => x && x.draft_id === draftId);
  if (!draft) return toast("No encontré ese borrador.");
  logAppEventD9("RECUPERAR_BORRADOR", { payload: draft, pedido_id: draftId, resultado: "ok", detalle: "Continuar borrador" });

  state.selectedClient = draft.cliente || null;
  state.orderNoteGeneral = String(draft.nota_pedido || draft.notaPedido || "").trim();
  state.activePriceList = draft.activePriceList || state.selectedClient?.lista_1 || state.activePriceList || "lista_1";
  state.manualPriceOverride = !!draft.manualPriceOverride;

  state.cart = (draft.carrito || []).map(saved => {
    const product = state.products.find(p => String(p.id) === String(saved.id));
    const base = product || saved;
    return {
      id: saved.id,
      nombre: product?.nombre || saved.nombre,
      cantidad: Number(saved.cantidad || 1),
      precio: product ? productPrice(product) : Number(saved.precio || 0),
      categoria: base.categoria || saved.categoria || "",
      nota_item: getItemNoteD9(saved)
    };
  });

  // Se borra al continuar para evitar que quede duplicado como borrador viejo.
  saveDraftsD9(drafts.filter(x => x && x.draft_id !== draftId));
  clearDraftPedidoIdD9();

  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderProducts();
  renderQuickLabels();
  renderCart();
  renderPendingBadge();
  showView("order");
  toast("Borrador cargado para continuar.");
}

function deleteDraftD9(draftId) {
  showD9Confirm({
    message: "¿Borrar este borrador?",
    detail: "No borra ningún pedido enviado ni nada de Google Sheets.",
    okText: "Borrar",
    cancelText: "Cancelar",
    onOk: () => {
      const drafts = getDraftsD9().filter(x => x && x.draft_id !== draftId);
      saveDraftsD9(drafts);
      logAppEventD9("BORRADOR_ELIMINADO", { pedido_id: draftId, resultado: "ok" });
      renderPendingAndDraftsD9();
      renderPendingBadge();
      toast("Borrador eliminado.");
    }
  });
}

async function syncPending() {
  if (state.isSyncing) return;

  const pending = readJSON(STORAGE_KEYS.pending, []);
  if (!navigator.onLine || !pending.length) {
    renderPendingBadge();
    if (!pending.length && state.currentView !== "order") toast("No hay pendientes.");
    return;
  }

  state.isSyncing = true;
  logAppEventD9("SYNC_PENDIENTES_INICIADA", { resultado: "inicio", detalle: `pendientes:${pending.length}` });
  const syncBtn = $("#btnSyncPending");
  const retryBtn = $("#btnRetryPendingD9");
  const syncBtnIsButton = syncBtn?.tagName === "BUTTON";
  if (syncBtnIsButton) {
    setButtonBusy(syncBtn, true, "Sincronizando...", syncBtn?.textContent?.trim() || "Pendientes", "Revisando y enviando pendientes");
  } else if (syncBtn) {
    syncBtn.classList.add("syncing");
  }
  if (retryBtn) {
    setButtonBusy(retryBtn, true, "Enviando pendientes...", retryBtn?.textContent?.trim() || "📤 Enviar pendientes a PC");
  }

  try {
    const remaining = [];
    let sentCount = 0;

    for (const item of pending) {
      try {
        if (isHistoryResolvedForPendingD9(item)) {
          logAppEventD9("PENDIENTE_DESCARTADO_YA_REENVIADO", { payload: item, resultado: "ok", detalle: "Ya figura cargado/reenvíado en historial" });
          continue;
        }

        const result = await trySendToWebhook(item);
        if (result.ok) {
          sentCount++;
          if (result?.data?.duplicated) {
            const warn = duplicateWarningTextD9();
            logAppEventD9("PENDIENTE_SYNC_WARNING", { payload: item, resultado: "posible_duplicado", detalle: warn });
            updateHistoryStatusByPedidoIdD9(item?.pedido_id || item?.pedidoId, "duplicado_warning", warn);
          } else {
            logAppEventD9("PENDIENTE_SYNC_OK", { payload: item, resultado: "ok" });
            updateHistoryStatusByPedidoIdD9(item?.pedido_id || item?.pedidoId, "ok", "Cargado en PC");
          }
        } else {
          logAppEventD9("PENDIENTE_SYNC_ERROR", { payload: item, resultado: "error", error: result?.error || "No llegó a PC" });
          updateHistoryStatusByPedidoIdD9(item?.pedido_id || item?.pedidoId, "pendiente", result?.error || "No llegó a PC");
          remaining.push(item);
        }
      } catch (err) {
        logAppEventD9("PENDIENTE_SYNC_ERROR", { payload: item, resultado: "catch", error: String(err) });
        updateHistoryStatusByPedidoIdD9(item?.pedido_id || item?.pedidoId, "pendiente", String(err));
        remaining.push(item);
      }
    }

    saveJSON(STORAGE_KEYS.pending, remaining);
    refreshPendingUiD9();
    schedulePendingHomeRefreshD9();

    if (sentCount && !remaining.length) {
      toast("Pendientes sincronizados.");
      if (syncBtnIsButton) pulseSuccess(syncBtn, "Sin pendientes", "Todo sincronizado");
      return;
    }

    if (sentCount && remaining.length) {
      toast(`Se enviaron ${sentCount}. Quedaron ${remaining.length} pendientes.`);
      return;
    }

    if (remaining.length) {
      toast(`Quedaron ${remaining.length} pendientes.`);
    }
  } finally {
    state.isSyncing = false;
    if (syncBtnIsButton) {
      setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes y en espera");
    } else if (syncBtn) {
      syncBtn.classList.remove("syncing");
    }
    const retryBtnDone = $("#btnRetryPendingD9");
    if (retryBtnDone) setButtonBusy(retryBtnDone, false, "Enviando pendientes...", "📤 Enviar pendientes a PC");
    refreshPendingUiD9();
    schedulePendingHomeRefreshD9();
  }
}

function renderHistory() {
  const history = readJSON(STORAGE_KEYS.history, []);
  const list = $("#historyList");
  if (!history.length) {
    list.className = "history-list empty-state";
    list.textContent = "Sin movimientos todavía.";
    return;
  }

  list.className = "history-list";
  list.innerHTML = history.map(item => {
    const itemId = item.id || `${item.fecha}_${item.cliente}_${item.total}`;
    const isOpen = state.historyOpenId === itemId;
    const items = Array.isArray(item.items) ? item.items : [];
    const debugId = getHistoryPedidoIdD9(item);
    const debugHtml = `
          <div class="mini-text history-debug-d9"><strong>ID interno:</strong> ${esc(debugId || 'NO ENCONTRADO')} · items: ${items.length} · vend_id: ${esc(item.vendedor_id || 'NO')}</div>`;
    const detailHtml = items.length
      ? `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          ${debugHtml}
          ${items.map(prod => `
            <div class="history-product-row">
              <div class="history-product-main">
                <strong>${esc(prod.nombre)}</strong>
                <div class="mini-text">${money(prod.precio)} c/u</div>
                ${getItemNoteD9(prod) ? `<div class="mini-text history-note-d9">Nota: ${esc(getItemNoteD9(prod))}</div>` : ""}
              </div>
              <div class="history-product-side">
                <span class="history-qty">x${esc(prod.cantidad)}</span>
                <strong>${money(prod.subtotal ?? (Number(prod.precio || 0) * Number(prod.cantidad || 0)))}</strong>
              </div>
            </div>`).join('')}
          ${String(item.nota_pedido || "").trim() ? `<div class="history-order-note-d9"><strong>Nota pedido:</strong> ${esc(item.nota_pedido)}</div>` : ""}
        </div>`
      : `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          ${debugHtml}
          <div class="mini-text">${esc(item.detalle || 'Sin detalle cargado.')}</div>
        </div>`;

    const isDupWarning = isHistoryItemDuplicadoAdvertenciaD9(item);
    const pcText = isDupWarning ? duplicateWarningTextD9() : (item.pc_status === "cargado" || item.status === "ok" ? "Cargado en PC" : "No llegó a PC");
    const isAnulado = isHistoryItemAnuladoD9(item);
    const estadoText = isAnulado ? " · ANULADO" : "";
    const anularBtn = (pcText === "Cargado en PC" && !isAnulado)
      ? `<button class="history-action-btn" data-anular-history="${esc(itemId)}" type="button">⛔ Anular</button>`
      : "";
    return `
      <div class="history-item ${isOpen ? 'is-open' : ''} ${isAnulado ? 'history-item-anulado-d9' : ''} ${isDupWarning ? 'history-item-duplicado-warning-d9' : ''}" data-history-id="${esc(itemId)}" role="button" tabindex="0">
        <div class="history-head-row">
          <div class="history-copy">
            <strong>${esc(item.cliente)}</strong>
            <div class="mini-text">${new Date(item.fecha).toLocaleString("es-AR")}</div>
            <div class="mini-text history-meta-line">${esc(item.vendedor)} · WhatsApp enviado${isDupWarning ? ' · ' + esc(pcText) : ' · ' + esc(pcText) + estadoText + (item.error ? ' · ' + esc(item.error) : '')}</div>
            <div class="history-actions history-actions-compact-d9" data-no-toggle>
              ${pcText === "Cargado en PC" ? '' : (debugId ? `<button class="history-action-btn history-action-main-d9" data-resync-history="${esc(itemId)}" type="button">🔁 Reenviar a PC</button>` : `<button class="history-action-btn history-action-main-d9" data-manual-load-history="${esc(itemId)}" type="button">📝 Cargar manual</button>`)}
              ${anularBtn}
              <button class="history-action-btn" data-reuse-history="${esc(itemId)}" type="button">↻ Reutilizar</button>
              <button class="history-delete-btn" data-delete-history="${esc(itemId)}" type="button" aria-label="Borrar pedido del historial">🗑️</button>
            </div>
          </div>
          <div class="history-side">
            <div class="product-price">${money(item.total)}</div>
            <div class="history-toggle">${isOpen ? '▲' : '▼'}</div>
          </div>
        </div>
        ${detailHtml}
      </div>`;
  }).join('');
}

function reuseHistoryItem(id) {
  const history = readJSON(STORAGE_KEYS.history, []);
  const item = history.find(x => x.id === id);
  if (!item) return toast("No encontré el pedido.");

  state.orderNoteGeneral = String(item.nota_pedido || item.notaPedido || "").trim();
  state.cart = (item.items || []).map(x => ({
    id: x.id,
    nombre: x.nombre,
    cantidad: Number(x.cantidad || 1),
    precio: Number(x.precio || 0),
    nota_item: getItemNoteD9(x)
  }));

  logAppEventD9("PEDIDO_REUTILIZADO", { pedido_id: getHistoryPedidoIdD9(item), cliente: item.cliente, total: item.total, resultado: "ok", detalle: `items:${(item.items || []).length}` });
  renderCart();
  showView("order");
  toast("Pedido reutilizado.");
}

function deleteHistoryItem(id) {
  showD9Confirm({
    message: "¿Borrar este pedido del historial local?",
    detail: "Esto no borra nada de Google Sheets ni cancela pedidos ya enviados.",
    okText: "Borrar",
    cancelText: "Cancelar",
    onOk: () => {
      const history = readJSON(STORAGE_KEYS.history, []);
      const item = history.find(x => x.id === id);
      const filtered = history.filter(x => x.id !== id);
      saveJSON(STORAGE_KEYS.history, filtered);

      if (item) {
        logAppEventD9("PEDIDO_BORRADO_HISTORIAL", {
          pedido_id: getHistoryPedidoIdD9(item) || id,
          cliente: item.cliente || item.cliente_nombre || "",
          total: item.total || item.total_pedido || "",
          resultado: "ok",
          detalle: `items:${(item.items || []).length}`
        });
      } else {
        logAppEventD9("PEDIDO_BORRADO_HISTORIAL", {
          pedido_id: id,
          resultado: "ok",
          detalle: "sin detalle local"
        });
      }

      if (state.historyOpenId === id) state.historyOpenId = null;

      renderHistory();
      toast("Pedido eliminado del historial local.");
    }
  });
}

function showD9Confirm({ message, detail = "", okText = "Aceptar", cancelText = "Cancelar", onOk }) {
  const prev = document.getElementById("d9ConfirmOverlay");
  if (prev) prev.remove();

  const overlay = document.createElement("div");
  overlay.id = "d9ConfirmOverlay";
  overlay.className = "d9-confirm-overlay";
  overlay.innerHTML = `
    <div class="d9-confirm-box" role="dialog" aria-modal="true">
      <h3>Distribuidora 9 dice:</h3>
      <p>${esc(message)}</p>
      ${detail ? `<small>${esc(detail)}</small>` : ""}
      <div class="d9-confirm-actions">
        <button class="d9-confirm-cancel" type="button">${esc(cancelText)}</button>
        <button class="d9-confirm-ok" type="button">${esc(okText)}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector(".d9-confirm-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });
  overlay.querySelector(".d9-confirm-ok")?.addEventListener("click", () => {
    close();
    if (typeof onOk === "function") onOk();
  });
}

function toggleHistoryItem(id) {
  state.historyOpenId = state.historyOpenId === id ? null : id;
  renderHistory();
  renderMostradorRoleD9();
  renderMostradorD9();
}

function exportHistory() {
  const history = readJSON(STORAGE_KEYS.history, []);
  if (!history.length) return toast("No hay historial para exportar.");
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `d9_historial_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function openRestoreHistory() {
  const input = $("#restoreHistoryFile");
  if (!input) return toast("No encontré el importador.");
  input.value = "";
  input.click();
}

function restoreHistoryFromFile(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) return toast("El archivo no parece un historial válido.");
      saveJSON(STORAGE_KEYS.history, data.slice(0, 300));
      state.historyOpenId = null;
      renderHistory();
      toast("Historial restaurado.");
    } catch (err) {
      console.warn(err);
      toast("No pude leer ese archivo.");
    }
  };
  reader.readAsText(file);
}


function resetTransientUI() {
  // No liberamos el candado de envío si todavía está vigente.
  // Al volver desde WhatsApp Android dispara pageshow/focus y antes podía habilitar doble envío.
  if (!(state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) {
    state.isSending = false;
  }
  state.isSyncing = false;
  const sendBtn = $("#btnSend");
  const syncBtn = $("#btnSyncPending");
  if (sendBtn) setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");
  if (syncBtn?.tagName === "BUTTON") setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes y en espera");
  else if (syncBtn) syncBtn.classList.remove("syncing");
  schedulePendingHomeRefreshD9();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}


function openOrderConfirmModal() {
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) return;
  if (validateOrder() !== true) return;

  const modal = $("#orderConfirmModal");
  const box = $("#orderConfirmContent");
  const confirmBtn = $("#btnConfirmOrderSend");
  if (!modal || !box || !confirmBtn) {
    sendOrder();
    return;
  }

  const payload = buildOrderPayload();
  const cliente = payload.cliente || {};
  const clienteNombre = cliente.nombre_real || cliente.nombre || "Cliente";
  const clienteExtra = [cliente.telefono || "", cliente.direccion || cliente.ciudad || ""].filter(Boolean).join(" · ");
  const productosDistintos = payload.carrito.length;
  const unidadesTotales = payload.carrito.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);

  const productosHtml = payload.carrito.map(item => `
    <div class="confirm-product-row-d9">
      <div>
        <strong>${esc(item.nombre)}</strong>
        <span>${esc(itemMetaLine(item))} · Cant: ${Number(item.cantidad || 0)}</span>
        ${getItemNoteD9(item) ? `<small class="confirm-note-d9">Nota: ${esc(getItemNoteD9(item))}</small>` : ""}
      </div>
      <b>${money(Number(item.precio || 0) * Number(item.cantidad || 0))}</b>
    </div>
  `).join("");

  box.innerHTML = `
    <div class="confirm-client-card-d9">
      <span>Cliente</span>
      <strong>${esc(clienteNombre)}</strong>
      ${clienteExtra ? `<small>${esc(clienteExtra)}</small>` : ""}
    </div>

    <div class="confirm-metrics-row-d9">
      <div class="confirm-metric-card-d9 compact">
        <span>Productos</span>
        <strong>${productosDistintos}</strong>
      </div>
      <div class="confirm-metric-card-d9 compact">
        <span>Unidades</span>
        <strong>${unidadesTotales}</strong>
      </div>
      <div class="confirm-metric-card-d9 total">
        <span>Total</span>
        <strong>${money(payload.total)}</strong>
      </div>
    </div>

    <div class="confirm-section-title-d9">Productos</div>
    <div class="confirm-products-d9">${productosHtml}</div>
    ${String(payload.nota_pedido || "").trim() ? `<div class="confirm-order-note-d9"><strong>Nota pedido:</strong> ${esc(payload.nota_pedido)}</div>` : ""}
  `;

  confirmBtn.disabled = false;
  confirmBtn.textContent = "Confirmar y enviar";
  openModal("orderConfirm");
}

function closeOrderConfirmModal() {
  closeModal("orderConfirm");
}

function confirmOrderAndSend() {
  const confirmBtn = $("#btnConfirmOrderSend");

  // D9 v1.3.17:
  // No cerramos el modal antes de llamar sendOrder(). En Android/Chrome,
  // cerrar/cambiar DOM antes del window.open podía cortar el gesto de usuario
  // y dejar el botón sin abrir WhatsApp.
  if (state.isSending || (state.orderSendLockUntil && Date.now() < state.orderSendLockUntil)) return;

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Enviando...";
  }

  sendOrder();
  window.setTimeout(closeOrderConfirmModal, 120);
}


function bindOrderConfirmDelegatedD9() {
  if (window.__d9OrderConfirmDelegatedV16) return;
  window.__d9OrderConfirmDelegatedV16 = true;

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest("#btnConfirmOrderSend");
    if (!btn) return;

    ev.preventDefault();
    ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();

    confirmOrderAndSend();
  }, true);
}

function bind() {
  bindOrderConfirmDelegatedD9();

  // D9: bind() se llama desde init y también desde observadores/renderizados.
  // Sin este candado se acumulaban listeners y un solo tap podía enviar el pedido dos veces.
  if (window.__d9MainBindDone) return;
  window.__d9MainBindDone = true;

  document.addEventListener("pointerdown", (ev) => {
    const target = ev.target.closest("button, .action-card-vnext, .status-pill-vnext, [data-view], [data-back]");
    if (!target) return;
    target.classList.add("tap-active-d9");
    window.setTimeout(() => target.classList.remove("tap-active-d9"), 160);
  }, { passive: true });


  bindInlineQtyCaptureD9();
  bindSelectedProductNoToggleD9();

  document.addEventListener("click", (e) => {
    const insideCategoryBtn = e.target.closest("#btnCategoryInsideProductModal");
    if (insideCategoryBtn) {
      e.preventDefault();
      e.stopPropagation();
      state.categoryPickerMode = state.productPickerMode === "mostrador" ? "mostrador" : "order";
      renderCategories();
      const categoryModal = document.getElementById("categoryModal");
      if (categoryModal) {
        categoryModal.classList.add("front-modal-d9");
        categoryModal.style.zIndex = "999999";
      }
      openModal("category");
      return;
    }
  });

  $("#btnGoOrder").addEventListener("click", () => { state.productPickerMode = "order"; showView("order"); });
  $("#btnGoPrices").addEventListener("click", () => { renderPriceListControls(); renderPriceProducts(); showView("prices"); });
  $("#btnGoHistory").addEventListener("click", () => { renderHistory(); showView("history"); });
  document.addEventListener("click", (ev) => { const b = ev.target.closest("#btnGoMostrador"); if (b) { renderMostradorD9(); showView("mostrador"); } });
  document.addEventListener("click", (ev) => { const b = ev.target.closest("#btnGoSalesHistoryD9"); if (b) { renderSalesHistoryD9(); showView("sales-history-d9"); } });
  $("#sellerBadge").addEventListener("click", () => openLogin(false));
  $("#btnPancko").addEventListener("click", () => {
    if (isAppUpdateAvailableD9) {
      reloadAppForUpdateD9();
      return;
    }
    refreshDataInBackgroundD9("manual");
  });
  $("#btnChangeSeller").addEventListener("click", () => openLogin(false));
  const companyBtn = $("#btnCompanyInfo");
  if (companyBtn) companyBtn.addEventListener("click", openCompanyInfo);
  const syncPendingEl = $("#btnSyncPending");
  if (syncPendingEl) syncPendingEl.addEventListener("click", () => { renderPendingAndDraftsD9(); showView("pending"); });
  $("#btnLogin").addEventListener("click", loginSeller);
  $("#btnLogout").addEventListener("click", logoutSeller);
  $("#btnSaveOccasionalClient").addEventListener("click", saveOccasionalClient);
  $("#sellerUser").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#sellerPass").focus(); });
  $("#sellerPass").addEventListener("keydown", (e) => { if (e.key === "Enter") loginSeller(); });
  $("#btnCloseLogin").addEventListener("click", closeLogin);
  $("#clientSearch").addEventListener("input", renderClients);
  const productSearchInputD9 = $("#productSearch");
  productSearchInputD9.addEventListener("input", renderProducts);
  productSearchInputD9.addEventListener("pointerdown", () => clearProductSearchD9(true));
  productSearchInputD9.addEventListener("focus", () => clearProductSearchD9(true));
  $("#priceSearch").addEventListener("input", (e) => { state.priceSearch = e.target.value.trim().toLowerCase(); renderPriceProducts(); });
  const sharePricePdfBtnD9 = $("#btnSharePricePdfD9");
  if (sharePricePdfBtnD9) sharePricePdfBtnD9.addEventListener("click", sharePriceListPdfD9);
  $("#priceListSelect").addEventListener("change", (e) => { state.activePriceList = e.target.value; refreshPricesAcrossApp(); });
  const orderPriceSelect = $("#orderPriceListSelect");
  if (orderPriceSelect) orderPriceSelect.addEventListener("change", (e) => {
    const next = e.target.value || "lista_1";
    if (state.activePriceList === next) {
      renderOrderPriceListControls();
      return;
    }
    state.activePriceList = next;
    state.manualPriceOverride = !!state.selectedClient && next !== (state.selectedClient.lista_1 || "lista_1");
    refreshPricesAcrossApp();
    if (state.cart.length) toast(`Se aplicó ${priceLabel(next)} al pedido.`);
  });
  $("#btnClearCart").addEventListener("click", clearCart);
  $("#orderNoteGeneralD9")?.addEventListener("input", (e) => setOrderNoteGeneralD9(e.target.value));
  $("#btnSend").addEventListener("click", openOrderConfirmModal);
  $("#btnCancelOrderConfirm")?.addEventListener("click", closeOrderConfirmModal);
  // D9 v1.3.33: guardado manual ahora es Borrador; pendiente solo por falla de envío.
  $("#btnSaveDraftD9")?.addEventListener("click", saveDraftNowD9);
  $("#btnExportHistory").addEventListener("click", exportHistory);
  $("#btnRestoreHistory")?.addEventListener("click", openRestoreHistory);
  $("#restoreHistoryFile")?.addEventListener("change", restoreHistoryFromFile);
  $("#btnOpenClients").addEventListener("click", () => {
    state.clientPickerMode = "order";
    if (state.seller?.rol === "cliente") return;
    if (!state.seller) {
      openOccasionalClientModal();
      return;
    }
    renderClients();
    openModal("client");
  });
  $("#btnOpenCategories").addEventListener("click", () => {
    state.categoryPickerMode = "order";
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    renderCategories();
    openModal("category");
  });
  $("#btnOpenProducts").addEventListener("click", () => {
    state.productPickerMode = "order";
    state.categoryPickerMode = "order";
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    state.productPickerMode = "order";
    renderProducts();
    openModal("product");
  });

  document.addEventListener("click", (ev) => {
    if (ev.target.closest("#btnMostradorOpenClients")) {
      state.clientPickerMode = "mostrador";
      renderClients();
      openModal("client");
      return;
    }
    if (ev.target.closest("#btnMostradorOpenCategories")) {
      state.categoryPickerMode = "mostrador";
      renderCategories();
      openModal("category");
      return;
    }
    if (ev.target.closest("#btnMostradorOpenProducts")) {
      state.productPickerMode = "mostrador";
      state.categoryPickerMode = "mostrador";
      renderProducts();
      openModal("product");
      return;
    }
  });

  document.addEventListener("input", (ev) => {
    if (ev.target && ev.target.id === "mostradorSearch") { state.mostradorSearch = ev.target.value.trim().toLowerCase(); renderMostradorD9(); }
  });

  document.addEventListener("click", async (ev) => {
    const addMost = ev.target.closest("[data-mostrador-add]");
    if (addMost) { addMostradorProductD9(addMost.dataset.mostradorAdd); return; }
    const deltaMost = ev.target.closest("[data-mostrador-delta]");
    if (deltaMost) { updateMostradorQtyDeltaD9(deltaMost.dataset.mostradorDelta, Number(deltaMost.dataset.delta || 0)); return; }
    const qtyMost = ev.target.closest("[data-mostrador-qty]");
    if (qtyMost) { editMostradorQtyD9(qtyMost.dataset.mostradorQty); return; }
    const remMost = ev.target.closest("[data-mostrador-remove]");
    if (remMost) { state.mostradorCart = state.mostradorCart.filter(x => String(x.id) !== String(remMost.dataset.mostradorRemove)); renderMostradorD9(); return; }
    if (ev.target.closest("#btnMostradorClear")) { resetMostradorD9(); return; }
    if (ev.target.closest("#btnMostradorPrint")) { printMostradorD9(); return; }
    if (ev.target.closest("#btnMostradorWhatsApp")) { whatsappMostradorD9(); return; }

    const back = ev.target.closest("[data-back]");
    if (back) showView(back.dataset.back);

    const closeBtn = ev.target.closest("[data-close-modal]");
    if (closeBtn) closeModal(closeBtn.dataset.closeModal);

    const occasional = ev.target.closest("#btnOccasionalClient");
    if (occasional) openOccasionalClientModal();

    const client = ev.target.closest("[data-client-id]");
    if (client) selectClient(client.dataset.clientId);

    const cat = ev.target.closest("[data-category]");
    if (cat) selectCategory(cat.dataset.category);

    const toggle = ev.target.closest("[data-toggle-product]");
    if (toggle && !ev.target.closest("[data-no-toggle]")) toggleProduct(toggle.dataset.toggleProduct);

    const qty = ev.target.closest("[data-qty]");
    if (qty) updateQty(qty.dataset.id, qty.dataset.qty === "plus" ? 1 : -1);

    const editQty = ev.target.closest("[data-edit-qty]");
    if (editQty) openQtyModalD9(editQty.dataset.editQty);

    const editNoteD9 = ev.target.closest("[data-edit-note-d9]");
    if (editNoteD9) { ev.stopPropagation(); editItemNoteD9(editNoteD9.dataset.editNoteD9); return; }

    const remove = ev.target.closest("[data-remove-id]");
    if (remove) removeItem(remove.dataset.removeId);

    const manualLoadHistory = ev.target.closest("[data-manual-load-history]");
    if (manualLoadHistory) {
      ev.stopPropagation();
      manualLoadHistoryItemsToPcD9(manualLoadHistory.dataset.manualLoadHistory);
      return;
    }

    const resyncHistory = ev.target.closest("[data-resync-history]");
    if (resyncHistory) {
      ev.stopPropagation();
      if (resyncHistory.disabled || resyncHistory.dataset.busy === "1") return;
      const originalText = resyncHistory.textContent;
      resyncHistory.dataset.busy = "1";
      resyncHistory.disabled = true;
      resyncHistory.textContent = "Enviando...";
      try {
        await resyncHistoryItemsToPcD9(resyncHistory.dataset.resyncHistory);
      } finally {
        if (document.body.contains(resyncHistory)) {
          resyncHistory.dataset.busy = "0";
          resyncHistory.disabled = false;
          resyncHistory.textContent = originalText || "🔁 Reenviar a PC";
        }
      }
      return;
    }

    const reuseHistory = ev.target.closest("[data-reuse-history]");
    if (reuseHistory) {
      ev.stopPropagation();
      reuseHistoryItem(reuseHistory.dataset.reuseHistory);
      return;
    }

    const anularHistory = ev.target.closest("[data-anular-history]");
    if (anularHistory) {
      ev.stopPropagation();
      anularHistoryPedidoD9(anularHistory.dataset.anularHistory);
      return;
    }

    const deleteHistory = ev.target.closest("[data-delete-history]");
    if (deleteHistory) {
      ev.stopPropagation();
      deleteHistoryItem(deleteHistory.dataset.deleteHistory);
      return;
    }

    const retryPendingD9 = ev.target.closest("#btnRetryPendingD9");
    if (retryPendingD9) {
      ev.stopPropagation();
      const pendientes = readJSON(STORAGE_KEYS.pending, []);
      if (state.isSyncing || retryPendingD9.disabled || retryPendingD9.dataset.busy === "1") {
        toast("Ya se están enviando pendientes.");
        return;
      }
      if (!pendientes.length) {
        toast("No hay pendientes.");
        refreshPendingUiD9();
        schedulePendingHomeRefreshD9();
        return;
      }
      retryPendingD9.dataset.busy = "1";
      logAppEventD9("REINTENTAR_PENDIENTES_TOCADO", { resultado: "tap", detalle: `pendientes:${pendientes.length}` });
      syncPending().finally(() => { retryPendingD9.dataset.busy = "0"; });
      return;
    }

    const continueDraftBtnD9 = ev.target.closest("[data-continue-draft-d9]");
    if (continueDraftBtnD9) {
      ev.stopPropagation();
      continueDraftD9(continueDraftBtnD9.dataset.continueDraftD9);
      return;
    }

    const deleteDraftBtnD9 = ev.target.closest("[data-delete-draft-d9]");
    if (deleteDraftBtnD9) {
      ev.stopPropagation();
      deleteDraftD9(deleteDraftBtnD9.dataset.deleteDraftD9);
      return;
    }

    const historyItem = ev.target.closest("[data-history-id]");
    if (historyItem) toggleHistoryItem(historyItem.dataset.historyId);

    const reuseSales = ev.target.closest("[data-reuse-sales-history]");
    if (reuseSales) {
      ev.stopPropagation();
      reuseSalesHistoryD9(reuseSales.dataset.reuseSalesHistory);
      return;
    }

    const deleteSales = ev.target.closest("[data-delete-sales-history]");
    if (deleteSales) {
      ev.stopPropagation();
      deleteSalesHistoryD9(deleteSales.dataset.deleteSalesHistory);
      return;
    }

    const salesHistoryItem = ev.target.closest("[data-sales-history-id]");
    if (salesHistoryItem) toggleSalesHistoryD9(salesHistoryItem.dataset.salesHistoryId);

    const bannerDot = ev.target.closest("[data-banner-slide]");
    if (bannerDot) {
      ev.preventDefault();
      goBannerSlide(bannerDot.dataset.bannerSlide);
      return;
    }

    const openPriceCats = ev.target.closest("#btnOpenPriceCategories");
    if (openPriceCats) {
      renderPriceCategoryModal();
      openModal("priceCategory");
    }

    const priceCategory = ev.target.closest("[data-price-category]");
    if (priceCategory) {
      state.priceCategory = priceCategory.dataset.priceCategory || "";
      renderPriceCategoryChips();
      renderPriceProducts();
      closeModal("priceCategory");
    }
  });

  const bannerEl = document.getElementById("bannerWrap");
  if (bannerEl) {
    bannerEl.addEventListener("touchstart", (ev) => {
      const t = ev.touches?.[0];
      if (!t) return;
      bannerCarousel.touchStartX = t.clientX;
      bannerCarousel.touchStartY = t.clientY;
    }, { passive: true });

    bannerEl.addEventListener("touchend", (ev) => {
      const t = ev.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - bannerCarousel.touchStartX;
      const dy = t.clientY - bannerCarousel.touchStartY;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      const rows = getBannerRows();
      if (rows.length <= 1) return;
      const nextIndex = dx < 0
        ? (bannerCarousel.index + 1) % rows.length
        : (bannerCarousel.index - 1 + rows.length) % rows.length;
      renderBannerWithTransition(nextIndex, dx < 0 ? 1 : -1);
      startBannerCarousel(rows);
    }, { passive: true });
  }

  window.addEventListener("online", async () => { renderNetwork(); try { await loadAllData(); persistCacheState(); renderAll(); } catch (e) { console.warn(e); } syncPending(); });
  window.addEventListener("offline", () => { renderNetwork(); renderAll(); });
  window.addEventListener("pageshow", () => { resetTransientUI(); renderQuickLabels(); renderCart(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) resetTransientUI(); });
}

function hydrateGuestClient() {
  const stored = readJSON(STORAGE_KEYS.guestClient, null);
  if (!stored?.nombre) return false;
  state.guestClientDraft = stored;
  return true;
}

function hydrateSeller() {
  const stored = readJSON(STORAGE_KEYS.seller, null);
  if (!stored?.id) return false;
  const seller = state.users.find(s => s.id === stored.id);
  if (!seller) return false;
  state.seller = seller;
  return true;
}


function mostradorTotalD9() {
  return state.mostradorCart.reduce((sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.precio) || 0), 0);
}
function renderMostradorQuickLabelsD9() {
  const client = document.getElementById("mostradorClientLabel");
  const category = document.getElementById("mostradorCategoryLabel");
  const products = document.getElementById("mostradorProductsLabel");
  if (client) client.textContent = state.mostradorClient
    ? (state.mostradorClient.ocasional ? (state.mostradorClient.nombre_real || state.mostradorClient.nombre || "Cliente nuevo / ocasional") : state.mostradorClient.nombre)
    : "Seleccionar cliente";
  if (category) category.textContent = state.mostradorCategory ? cleanCategory(state.mostradorCategory) : "Todas las categorías";
  if (products) products.textContent = state.mostradorCart.length ? `${state.mostradorCart.length} productos seleccionados` : "Seleccionar productos";
}

function mostradorQtyTextD9(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return String(n).replace(".", ",");
}

function mostradorPrecioActualD9(item) {
  const precioGuardado = Number(item?.precio || 0);
  if (Number.isFinite(precioGuardado) && precioGuardado > 0) return precioGuardado;
  const prod = state.products.find(p => String(p.id) === String(item?.id));
  return Number(productPrice(prod) || 0);
}

function asegurarPrecioMostradorD9(item) {
  if (!item) return 0;
  const precio = mostradorPrecioActualD9(item);
  item.precio = precio;
  return precio;
}

function renderMostradorD9() {
  const cartBox = $("#mostradorCartList");
  const totalEl = $("#mostradorTotal");
  if (!cartBox || !totalEl) return;
  renderMostradorQuickLabelsD9();

  if (!state.mostradorCart.length) {
    cartBox.className = "cart-list empty-state";
    cartBox.textContent = "Todavía no agregaste productos.";
  } else {
    cartBox.className = "cart-list";
    cartBox.innerHTML = state.mostradorCart.map(item => {
      const precio = asegurarPrecioMostradorD9(item);
      const cantidadTxt = mostradorQtyTextD9(item.cantidad);
      const subtotal = Number(item.cantidad || 0) * Number(precio || 0);
      return `
      <div class="cart-item mostrador-cart-item-d9">
        <div class="cart-item-top">
          <div>
            <strong>${esc(item.nombre)}</strong>
            <div class="cart-meta">${esc(cantidadTxt)} × ${money(precio)}</div>
          </div>
          <button class="remove-btn" data-mostrador-remove="${esc(item.id)}" type="button">Quitar</button>
        </div>
        <div class="mostrador-line-d9 mostrador-line-controls-d9">
          <button class="qty-step-btn-d9" data-mostrador-delta="${esc(item.id)}" data-delta="-1" type="button">−</button>
          <span class="mostrador-qty-number-d9">${esc(cantidadTxt)}</span>
          <button class="qty-step-btn-d9" data-mostrador-delta="${esc(item.id)}" data-delta="1" type="button">+</button>
          <button class="qty-edit-btn-d9 mostrador-qty-edit-manual-d9" data-mostrador-qty="${esc(item.id)}" type="button">✏️ Cant.</button>
          <strong>${money(subtotal)}</strong>
        </div>
      </div>`;
    }).join("");
  }
  totalEl.textContent = money(mostradorTotalD9());
}

function updateMostradorQtyDeltaD9(id, delta) {
  const item = state.mostradorCart.find(x => String(x.id) === String(id));
  if (!item) return;
  item.cantidad = Number(item.cantidad || 0) + Number(delta || 0);
  asegurarPrecioMostradorD9(item);
  if (item.cantidad <= 0) state.mostradorCart = state.mostradorCart.filter(x => String(x.id) !== String(id));
  renderMostradorD9();
  if (state.productPickerMode === "mostrador") renderProducts();
}

function addMostradorProductD9(id) {
  const p = state.products.find(x => String(x.id) === String(id));
  if (!p) return;
  const current = state.mostradorCart.find(x => String(x.id) === String(id));
  if (current) {
    current.cantidad = (Number(current.cantidad) || 0) + 1;
  } else {
    state.mostradorCart.push({ id: p.id, nombre: p.nombre, precio: productPrice(p), cantidad: 1 });
  }
  renderMostradorD9();
  if (state.productPickerMode === "mostrador") renderProducts();
}
function editMostradorQtyD9(id) {
  openQtyModalD9(id, "mostrador");
}

function resetMostradorD9() {
  if (!state.mostradorCart.length || confirm("¿Limpiar venta mostrador?")) {
    state.mostradorCart = [];
    state.mostradorVentaDraftId = "";
    state.mostradorVentaFingerprint = "";
    renderMostradorD9();
  }
}


function mostradorFingerprintD9() {
  const clienteObj = state.mostradorClient || {};
  const items = state.mostradorCart.map(item => ({
    id: String(item.id || ""),
    nombre: String(item.nombre || ""),
    cantidad: Number(item.cantidad || 0),
    precio: Number(item.precio || 0)
  }));
  return JSON.stringify({
    usuario_id: String(state.seller?.id || ""),
    cliente_id: String(clienteObj.id || ""),
    cliente: String(clienteObj.nombre_real || clienteObj.nombre || "Consumidor final"),
    items
  });
}

function generarVentaMostradorIdD9(usuarioId) {
  const user = String(usuarioId || "0").replace(/[^A-Z0-9_-]/gi, "").toUpperCase() || "0";
  const counter = nextLocalCounterD9("VM", user);
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = randomCryptoD9(3);
  return `VM-${user}-${counter}-${ts}-${rnd}`;
}

function ensureMostradorVentaIdD9() {
  const fp = mostradorFingerprintD9();
  if (!state.mostradorVentaDraftId || state.mostradorVentaFingerprint !== fp) {
    state.mostradorVentaDraftId = generarVentaMostradorIdD9(state.seller?.id || "0");
    state.mostradorVentaFingerprint = fp;
  }
  return state.mostradorVentaDraftId;
}

function buildMostradorPayloadD9() {
  const now = new Date();
  const clienteObj = state.mostradorClient || {};
  const clienteNombre = clienteObj.nombre_real || clienteObj.nombre || "Consumidor final";
  const ventaId = ensureMostradorVentaIdD9();
  const items = state.mostradorCart.map(item => {
    const cantidad = Number(item.cantidad || 0);
    const precio = Number(item.precio || 0);
    return {
      id: item.id || "",
      id_producto: item.id || "",
      nombre: item.nombre || "",
      cantidad,
      precio,
      precio_unitario: precio,
      subtotal: cantidad * precio
    };
  });
  const total = items.reduce((sum, x) => sum + Number(x.subtotal || 0), 0);
  return {
    action: "guardar_venta_mostrador",
    tipo: "mostrador",
    venta_id: ventaId,
    fecha: now.toISOString(),
    fecha_txt: now.toLocaleString("es-AR"),
    usuario_id: state.seller?.id || "",
    usuario: state.seller?.nombre || "Mostrador",
    rol: state.seller?.rol || "mostrador",
    cliente_id: clienteObj.id || "",
    cliente: clienteNombre,
    telefono: clienteObj.telefono || "",
    direccion: clienteObj.direccion || "",
    items,
    total_venta: total,
    total,
    fingerprint: state.mostradorVentaFingerprint || mostradorFingerprintD9()
  };
}

function saveMostradorHistoryD9(payload, status = "local", error = "", options = {}) {
  const history = readJSON(STORAGE_KEYS.salesHistory, []);
  const id = payload.venta_id || `VM_LOCAL_${Date.now()}`;
  const existingIndex = history.findIndex(x => String(x.id || x.venta_id || "") === String(id));
  const prev = existingIndex >= 0 ? history[existingIndex] : {};
  const entry = {
    ...prev,
    id,
    venta_id: payload.venta_id || prev.venta_id || "",
    fecha: payload.fecha || prev.fecha || new Date().toISOString(),
    fecha_txt: payload.fecha_txt || prev.fecha_txt || new Date().toLocaleString("es-AR"),
    usuario: payload.usuario || prev.usuario || state.seller?.nombre || "Mostrador",
    cliente: payload.cliente || prev.cliente || "Consumidor final",
    cliente_id: payload.cliente_id || prev.cliente_id || "",
    telefono: payload.telefono || prev.telefono || "",
    direccion: payload.direccion || prev.direccion || "",
    total: Number(payload.total_venta || payload.total || prev.total || 0),
    status,
    error,
    saved_sheet: Boolean(options.saved_sheet || prev.saved_sheet || false),
    fingerprint: payload.fingerprint || prev.fingerprint || "",
    items: (payload.items || prev.items || []).map(x => ({
      id: x.id || x.id_producto || "",
      id_producto: x.id_producto || x.id || "",
      nombre: x.nombre || "",
      cantidad: Number(x.cantidad || 0),
      precio: Number(x.precio || x.precio_unitario || 0),
      subtotal: Number(x.subtotal || 0)
    }))
  };

  if (existingIndex >= 0) {
    history[existingIndex] = entry;
  } else {
    history.unshift(entry);
  }

  saveJSON(STORAGE_KEYS.salesHistory, history.slice(0, 200));
  renderSalesHistoryD9();
  renderMostradorRoleD9();
  return entry;
}

function ventaMostradorYaGuardadaEnSheetD9(ventaId) {
  const history = readJSON(STORAGE_KEYS.salesHistory, []);
  const item = history.find(x => String(x.id || x.venta_id || "") === String(ventaId));
  return Boolean(item?.saved_sheet);
}

async function persistMostradorVentaD9(motivo = "local") {
  if (!state.mostradorCart.length) return null;
  const payload = buildMostradorPayloadD9();
  const statusBase = motivo === "whatsapp" ? "enviado" : motivo === "impresion" ? "impreso" : "local";
  saveMostradorHistoryD9(payload, statusBase, motivo === "whatsapp" ? "WhatsApp abierto" : "", { saved_sheet: false });

  if (ventaMostradorYaGuardadaEnSheetD9(payload.venta_id)) {
    return { ok: true, already_saved: true, payload };
  }

  if (!navigator.onLine) {
    saveMostradorHistoryD9(payload, "pendiente", "Sin conexión", { saved_sheet: false });
    return { ok: false, pending: true, payload };
  }

  try {
    const res = await sendMostradorVentaToSheetD9(payload);
    if (res?.ok) {
      saveMostradorHistoryD9(payload, statusBase, "", { saved_sheet: true });
      return { ok: true, payload, res };
    }
    saveMostradorHistoryD9(payload, "pendiente", res?.error || "No se confirmó en Sheet", { saved_sheet: false });
    console.warn("Venta mostrador pendiente:", res?.error || res);
    return { ok: false, payload, res };
  } catch (err) {
    saveMostradorHistoryD9(payload, "pendiente", String(err), { saved_sheet: false });
    console.warn("Venta mostrador pendiente:", err);
    return { ok: false, payload, error: err };
  }
}


async function sendMostradorVentaToSheetD9(payload) {
  const apiBase = getApiBaseD9();
  const body = JSON.stringify(payload);

  async function tryPost(options) {
    const r = await fetch(`${apiBase}?action=guardar_venta_mostrador`, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      ...options
    });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { ok: false, raw: text }; }
  }

  try {
    const res = await tryPost({
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    });
    if (res?.ok) return res;
  } catch (_) {}

  return tryPost({
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `payload=${encodeURIComponent(body)}`
  });
}

function renderSalesHistoryD9() {
  const list = document.getElementById("salesHistoryListD9");
  if (!list) return;
  const history = readJSON(STORAGE_KEYS.salesHistory, []);
  if (!history.length) {
    list.className = "history-list empty-state";
    list.innerHTML = "Sin ventas guardadas todavía.";
    return;
  }
  list.className = "history-list";
  list.innerHTML = history.map(item => {
    const id = item.id || item.venta_id || "";
    const isOpen = state.salesHistoryOpenId === id;
    const detalle = (item.items || []).map(prod => `
      <div class="history-product-row">
        <div class="history-product-main">
          <strong>${esc(prod.nombre || "")}</strong>
          <small>${esc(fmtQtyD9(prod.cantidad))} × ${esc(money(prod.precio))}</small>
        </div>
        <div class="history-product-side">
          <strong>${esc(money(prod.subtotal || (Number(prod.cantidad||0)*Number(prod.precio||0))))}</strong>
        </div>
      </div>`).join("");
    return `
      <div class="history-item ${isOpen ? 'is-open' : ''}" data-sales-history-id="${esc(id)}" role="button" tabindex="0">
        <div class="history-head-row">
          <div class="history-copy">
            <strong>${esc(item.cliente || "Consumidor final")}</strong>
            <div class="mini-text">${esc(new Date(item.fecha || Date.now()).toLocaleString("es-AR"))} · ${esc(item.usuario || "Mostrador")}</div>
            <div class="mini-text history-meta-line">${esc(item.status || "local")}${item.error ? ' · ' + esc(item.error) : ''}</div>
            <div class="history-actions" data-no-toggle>
              <button class="history-reuse-btn" data-reuse-sales-history="${esc(id)}" type="button" aria-label="Reutilizar venta">↻ Reutilizar</button>
              <button class="history-delete-btn" data-delete-sales-history="${esc(id)}" type="button" aria-label="Borrar venta del historial">🗑️ Borrar</button>
            </div>
          </div>
          <div class="history-side">
            <strong>${esc(money(item.total || 0))}</strong>
            <div class="history-toggle">${isOpen ? '▲' : '▼'}</div>
          </div>
        </div>
        <div class="history-detail ${isOpen ? '' : 'hidden'}">
          <div class="history-detail-summary">${(item.items || []).length} productos · Total ${esc(money(item.total || 0))}</div>
          ${detalle}
        </div>
      </div>`;
  }).join("");
}

function toggleSalesHistoryD9(id) {
  state.salesHistoryOpenId = state.salesHistoryOpenId === id ? null : id;
  renderSalesHistoryD9();
}

function reuseSalesHistoryD9(id) {
  const history = readJSON(STORAGE_KEYS.salesHistory, []);
  const sale = history.find(x => String(x.id || x.venta_id || "") === String(id));
  if (!sale) return toast("No encontré esa venta.");

  const clienteId = String(sale.cliente_id || "").trim();
  const clienteNombre = String(sale.cliente || "").trim();
  const found = state.clients.find(c =>
    (clienteId && String(c.id || "") === clienteId) ||
    (clienteNombre && String(c.nombre || "").trim().toLowerCase() === clienteNombre.toLowerCase())
  );

  state.mostradorClient = found || {
    id: clienteId || `ocasional_${Date.now()}`,
    nombre: clienteNombre || "Consumidor final",
    nombre_real: clienteNombre || "Consumidor final",
    telefono: sale.telefono || "",
    direccion: sale.direccion || "",
    ciudad: "",
    ocasional: true
  };

  state.mostradorCart = (sale.items || []).map(x => ({
    id: x.id_producto || x.id || "",
    nombre: x.nombre || "",
    precio: Number(x.precio || 0),
    cantidad: Number(x.cantidad || 0)
  })).filter(x => x.nombre && Number(x.cantidad) > 0);

  state.mostradorVentaDraftId = "";
  state.mostradorVentaFingerprint = "";
  state.salesHistoryOpenId = null;
  renderMostradorD9();
  showView("mostrador");
  toast("Venta reutilizada. Revisá y enviá/impimí como nueva.");
}

function deleteSalesHistoryD9(id) {
  showConfirmD9({
    title: "Distribuidora 9 dice:",
    message: "¿Borrar esta venta del historial local?",
    okText: "Borrar",
    cancelText: "Cancelar",
    danger: true,
    onOk: () => {
      const history = readJSON(STORAGE_KEYS.salesHistory, []);
      saveJSON(STORAGE_KEYS.salesHistory, history.filter(x => (x.id || x.venta_id) !== id));
      if (state.salesHistoryOpenId === id) state.salesHistoryOpenId = null;
      renderSalesHistoryD9();
      toast("Venta eliminada del historial local.");
    }
  });
}

function buildMostradorTextD9() {
  const fecha = new Date().toLocaleString("es-AR");
  const operador = state.seller?.nombre || "Mostrador";
  const cliente = state.mostradorClient?.nombre_real || state.mostradorClient?.nombre || "Consumidor final";
  const lines = [
    "REMITO INTERNO / MOSTRADOR",
    `Fecha: ${fecha}`,
    `Operador: ${operador}`,
    `Cliente: ${cliente}`,
    "────────────────────"
  ];
  state.mostradorCart.forEach((item, i) => {
    const total = (Number(item.cantidad)||0) * (Number(item.precio)||0);
    lines.push(`${i+1}) ${item.nombre}`);
    lines.push(`   Cant/Peso: ${fmtQtyD9(item.cantidad)} · Unit: ${money(item.precio)} · Total: ${money(total)}`);
  });
  lines.push("────────────────────");
  lines.push(`TOTAL: ${money(mostradorTotalD9())}`);
  lines.push("Comprobante no oficial");
  return lines.join("\n");
}
function whatsappMostradorD9() {
  if (!state.mostradorCart.length) return toast("Agregá productos.");
  const payload = buildMostradorPayloadD9();
  const phone = onlyDigits(state.seller?.wasap_report || getDefaultWhatsAppD9());
  const text = buildMostradorTextD9();
  const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");

  persistMostradorVentaD9("whatsapp");
}

function printMostradorD9() {
  if (!state.mostradorCart.length) return toast("Agregá productos.");
  persistMostradorVentaD9("impresion");
  const rows = state.mostradorCart.map(item => {
    const total = (Number(item.cantidad)||0) * (Number(item.precio)||0);
    return `<tr><td>${esc(item.nombre)}</td><td>${esc(fmtQtyD9(item.cantidad))}</td><td>${esc(money(item.precio))}</td><td>${esc(money(total))}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Mostrador</title><style>
    @page{size:A4;margin:12mm} body{font-family:Arial,sans-serif;color:#111;font-size:13px} h1{font-size:20px;margin:0 0 4px} .muted{color:#555;margin-bottom:12px} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left} th{font-size:11px;text-transform:uppercase} td:nth-child(2),td:nth-child(3),td:nth-child(4),th:nth-child(2),th:nth-child(3),th:nth-child(4){text-align:right;white-space:nowrap}.total{font-size:18px;font-weight:800;text-align:right;margin-top:12px}.foot{font-size:11px;color:#666;margin-top:14px}</style></head><body>
    <h1>Remito interno / mostrador</h1><div class="muted">Fecha: ${esc(new Date().toLocaleString("es-AR"))} · Operador: ${esc(state.seller?.nombre || "Mostrador")} · Cliente: ${esc(state.mostradorClient?.nombre_real || state.mostradorClient?.nombre || "Consumidor final")}</div>
    <table><thead><tr><th>Producto</th><th>Cant/Peso</th><th>Unit.</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="total">TOTAL: ${esc(money(mostradorTotalD9()))}</div><div class="foot">Comprobante no oficial</div>
    <script>window.print();<\/script></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return toast("El navegador bloqueó la impresión.");
  win.document.open(); win.document.write(html); win.document.close();
}
function setupMostradorHomeD9() {
  const homeView = document.querySelector("#view-home");
  const orderBtn = document.getElementById("btnGoOrder");
  if (!homeView || !orderBtn || document.getElementById("btnGoMostrador")) return;

  const btn = document.createElement("button");
  btn.id = "btnGoMostrador";
  btn.className = "cta-main-vnext mostrador-cta-main-d9 hidden";
  btn.type = "button";
  btn.innerHTML = `
    <span class="cta-icon-vnext">🏪</span>
    <span class="cta-copy-vnext">
      <strong>VENTA MOSTRADOR</strong>
      <small>Remito interno y comprobante</small>
    </span>
    <span class="cta-arrow-vnext">›</span>
  `;
  homeView.insertBefore(btn, orderBtn);
}

function setupMostradorHistoryHomeD9() {
  const grid = document.querySelector(".home-grid-vnext");
  if (!grid || document.getElementById("btnGoSalesHistoryD9")) return;
  const btn = document.createElement("button");
  btn.id = "btnGoSalesHistoryD9";
  btn.className = "action-card-vnext hidden";
  btn.type = "button";
  btn.innerHTML = `
    <span class="action-head-vnext">
      <span class="icon-wrap-vnext cyan">🧾</span>
      <span class="title-group-vnext">
        <strong>Historial ventas</strong>
        <small>Ventas mostrador locales</small>
      </span>
    </span>
    <span class="go-vnext">›</span>
  `;
  const userBtn = document.getElementById("btnChangeSeller");
  grid.insertBefore(btn, userBtn || grid.firstChild);
}

function setupSalesHistoryViewD9() {
  const main = document.querySelector("main");
  if (!main || document.getElementById("view-sales-history-d9")) return;
  const sec = document.createElement("section");
  sec.id = "view-sales-history-d9";
  sec.className = "view";
  sec.innerHTML = `
    <div class="view-head history-head-d9">
      <button class="back-btn history-home-d9 home-red-d9" data-back="home" type="button" aria-label="Volver al inicio">🏠</button>
      <div class="history-title-d9">
        <h2>Historial ventas</h2>
        <p class="subhead">Ventas de mostrador guardadas en este celular.</p>
      </div>
    </div>
    <div class="card">
      <div id="salesHistoryListD9" class="history-list empty-state">Sin ventas guardadas todavía.</div>
    </div>
  `;
  main.appendChild(sec);
}

function setupMostradorViewD9() {
  const main = document.querySelector("main");
  if (!main || document.getElementById("view-mostrador")) return;
  const sec = document.createElement("section");
  sec.id = "view-mostrador";
  sec.className = "view";
  sec.innerHTML = `
    <div class="view-head history-head-d9">
      <button class="back-btn history-home-d9 home-red-d9" data-back="home" type="button">🏠</button>
      <div class="history-title-d9"><h2>Venta mostrador</h2><p class="subhead">Remito interno y comprobante.</p></div>
    </div>

    <div class="card quick-grid-card mostrador-picker-card-d9">
      <button id="btnMostradorOpenClients" class="picker-btn" type="button">
        <span class="picker-label">Cliente</span>
        <strong id="mostradorClientLabel">Seleccionar cliente</strong>
      </button>

      <button id="btnMostradorOpenCategories" class="picker-btn" type="button">
        <span class="picker-label">Categoría</span>
        <strong id="mostradorCategoryLabel">Todas las categorías</strong>
      </button>

      <button id="btnMostradorOpenProducts" class="picker-btn" type="button">
        <span class="picker-label">Productos</span>
        <strong id="mostradorProductsLabel">Seleccionar productos</strong>
      </button>
    </div>

    <div class="card section-block">
      <div class="section-title-row between"><h3>Comprobante</h3><button id="btnMostradorClear" class="link-btn danger" type="button">Limpiar</button></div>
      <div id="mostradorCartList" class="cart-list empty-state">Todavía no agregaste productos.</div>
      <div class="summary-box compact-summary"><div class="summary-row total"><span>Total</span><strong id="mostradorTotal">$ 0</strong></div></div>
      <div class="actions-stack"><button id="btnMostradorPrint" class="primary-btn" type="button">Imprimir</button><button id="btnMostradorWhatsApp" class="secondary-btn" type="button">Enviar WhatsApp</button></div>
    </div>`;
  main.appendChild(sec);
}

function renderMostradorRoleD9() {
  setupMostradorHomeD9();
  setupMostradorHistoryHomeD9();
  setupMostradorViewD9();
  setupSalesHistoryViewD9();
  const on = isMostradorD9();
  document.getElementById("btnGoMostrador")?.classList.toggle("hidden", !on);
  document.getElementById("btnGoSalesHistoryD9")?.classList.toggle("hidden", !on);
  document.getElementById("bannerWrap")?.classList.toggle("hidden", on);
  if (on) renderSalesHistoryD9();
}

function renderAll() {
  renderTop();
  renderNetwork();
  renderSellerBadge();
  renderPendingBadge();
  renderBanner();
  renderTicker();
  renderSupport();
  syncSessionUI();
  if (state.currentView !== "order") applyUserContext();
  renderQuickLabels();
  renderCategories();
  renderClients();
  renderSelectedClient();
  renderProducts();
  renderCart();
  renderPriceListControls();
  renderPriceProducts();
  renderHistory();
  renderMostradorRoleD9();
  renderMostradorD9();
}


function formatSellerNameLines(nombre){
  const clean = String(nombre || "").trim();
  if (!clean) return ["Sin usuario"];
  if (clean.length <= 18) return [clean];

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return [words.slice(0, 2).join(" "), words.slice(2).join(" ")];
  }

  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")].filter(Boolean);
}

function renderSellerName(el, nombre){
  const lines = formatSellerNameLines(nombre);
  el.replaceChildren();
  lines.forEach((line, index) => {
    if (index) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
}


function shouldSkipAutoRefreshD9() {
  if (!navigator.onLine) return true;
  if (state.isSending || state.isSyncing) return true;
  if (state.currentView === "order") return true;
  if (typeof getOpenModalName === "function" && getOpenModalName()) return true;
  return false;
}

async function refreshDataInBackgroundD9(reason = "auto") {
  if (shouldSkipAutoRefreshD9()) return false;

  const isManual = reason === "manual";
  if (isManual) {
    tapFeedbackD9();
    setSyncChipBusyD9(true);
  }

  try {
    await loadAllData();
    persistCacheState();
    hydrateGuestClient();
    hydrateSeller();

    if (state.currentView !== "order") {
      applyUserContext();
    }

    safeRenderAfterBackgroundTaskD9();
    renderTicker();
    renderBanner();
    renderNetwork();
    checkAppVersionD9();

    lastAutoRefreshAtD9 = Date.now();
    if (isManual) {
      toast("Datos sincronizados.");
      flushAppLogsD9();
    }
    console.log(`[D9] Datos actualizados automáticamente (${reason}).`);
    return true;
  } catch (err) {
    console.warn(`[D9] No se pudo actualizar automáticamente (${reason}):`, err);
    if (isManual) toast("No se pudo sincronizar.");
    logAppEventD9("SYNC_ERROR", { resultado: "error", detalle: reason, error: String(err) });
    return false;
  } finally {
    if (isManual) setSyncChipBusyD9(false);
  }
}

function setupAutoRefreshD9() {
  if (autoRefreshStartedD9) return;
  autoRefreshStartedD9 = true;
  lastAutoRefreshAtD9 = Date.now();

  setInterval(() => {
    refreshDataInBackgroundD9("interval");
  }, AUTO_REFRESH_MS);

  const refreshOnReturn = () => {
    if (document.visibilityState && document.visibilityState !== "visible") return;
    if (Date.now() - lastAutoRefreshAtD9 < FOREGROUND_REFRESH_MIN_MS) return;
    refreshDataInBackgroundD9("return");
  };

  document.addEventListener("visibilitychange", refreshOnReturn);
  window.addEventListener("focus", refreshOnReturn);
}

async function init() {
  setupInstallPromptD9();
  window.addEventListener("online", () => { logAppEventD9("APP_ONLINE", { resultado: "online" }); flushAppLogsD9(); syncPending(); });
  window.addEventListener("offline", () => logAppEventD9("APP_OFFLINE", { resultado: "offline" }));
  enableTickerTouchD9();
  injectOrderConfirmStylesD9();
  injectPriceListCleanStickyD9();
  injectCategoryChipStylesD9();
  injectProductModalMicroStylesD9();
  injectInlineQtyStylesD9();
  setupAndroidBackButton();
  bind();
  hydrateCacheState();
  hydrateGuestClient();
  hydrateSeller();
  renderAll();
  renderNetwork();
  logAppEventD9("APP_ABIERTA", { resultado: "init" });
  logAppEventD9("VERSION_CARGADA", { resultado: "ok", detalle: APP_VERSION });
  flushAppLogsD9();
  await registerServiceWorker();
  setupAutoRefreshD9();

  if (!navigator.onLine) {
    return;
  }

  try {
    await loadAllData();
    logAppEventD9("BOOTSTRAP_OK", { resultado: "ok", detalle: `productos:${state.products.length} clientes:${state.clients.length}` });
    await registerAppVersionD9();
    persistCacheState();
    hydrateGuestClient();
    hydrateSeller();
    // Si el usuario está en "order" al momento del bootstrap, no pisamos su contexto
    if (state.currentView !== "order") {
      applyUserContext();
    }
    renderAll();
    renderNetwork();
    checkAppVersionD9();
    syncPending();
  } catch (error) {
    logAppEventD9("BOOTSTRAP_ERROR", { resultado: "error", error: String(error) });
    console.error(error);
    if (!state.products.length && !state.clients.length) {
      toast("No pude cargar los datos.");
    }
    renderNetwork();
  }
}
// D9 v1.3.17: Confirmar y enviar usa listener delegado y abre WhatsApp antes de cerrar modal.
init();
