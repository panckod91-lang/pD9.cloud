const SHEET_ID = "1wHdgm_V0mloLaIsVPIIqbmTYBomx8DIUmXEplClCMz8";
const WEBHOOK_ENDPOINTS = [
  "https://wild-pond-6b36.pancko-d9.workers.dev",
  // "/.netlify/functions/order" // ✋ backup Netlify (desactivado)
];
const OPEN_SHEET = (sheet) => `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(sheet)}`;
const STORAGE_KEYS = {
  seller: "d9_usuario",
  history: "d9_historial",
  pending: "d9_pendientes",
  guestClient: "d9_invitado_cliente"
};
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
  currentView: "home",
  historyOpenId: null,
  isSending: false,
  isSyncing: false,
  manualPriceOverride: false
};

const bannerCarousel = {
  index: 0,
  timer: null,
  resumeTimer: null,
  delay: 5200,
  resumeDelay: 5000,
  signature: "",
  touchStartX: 0,
  touchStartY: 0,
  isAnimating: false,
  isPausedByUser: false
};

const $ = (s) => document.querySelector(s);
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(v) || 0);
const readJSON = (k, f = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
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
const isTrue = (v) => String(v).trim().toLowerCase() === "true";
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
  if (val === true) return true;
  return String(val).trim().toLowerCase() === "true";
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
  if (!row) return fallback;
  if (typeof row === "string") return row || fallback;
  return row.valor || row.tex1 || fallback;
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
  const dual = btn.classList.contains("home-btn");
  const idleTitle = btn.dataset.idleTitle || btn.dataset.title || btn.textContent.trim();
  const idleSub = btn.dataset.idleSub || btn.dataset.sub || "";
  const idle = btn.dataset.idleLabel || btn.dataset.title || btn.textContent.trim();

  btn.classList.add("is-success");
  if (dual) renderDualButton(btn, label, sublabel || idleSub || "Todo sincronizado");
  else btn.textContent = label;

  setTimeout(() => {
    btn.classList.remove("is-success");
    if (dual) renderDualButton(btn, idleTitle, idleSub);
    else btn.textContent = idle;
  }, 1400);
}



function openWhatsApp(phone, message) {
  const digits = onlyDigits(phone);
  if (!digits) return false;
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, "_blank");
  return true;
}


async function fetchSheet(name) {
  const r = await fetch(OPEN_SHEET(name), { cache: "no-store" });
  if (!r.ok) throw new Error(`No pude leer ${name}`);
  return r.json();
}

async function loadAllData() {
  const [confi, sellers, clients, products, ads, support] = await Promise.all([
    fetchSheet("confi"),
    fetchSheet("usuarios"),
    fetchSheet("clientes"),
    fetchSheet("productos"),
    fetchSheet("publicidad"),
    fetchSheet("soporte")
  ]);

  state.config = parseRowsByKey(confi);
  state.users = sellers.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    usuario: String(r.usuario || "").trim().toLowerCase(),
    nombre: String(r.nombre || "").trim(),
    clave: String(r.clave || "").trim(),
    rol: String(r.rol || "cliente").trim().toLowerCase(),
    lista_precio: String(r.lista_precio || "").trim().toLowerCase(),
    cliente_id: String(r.cliente_id || "").trim(),
    wasap_report: String(r.wasap_report || "").trim()
  }));
  state.clients = clients.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    telefono: String(r.telefono || "").trim(),
    direccion: String(r.direccion || "").trim(),
    ciudad: String(r.ciudad || r.localidad || "").trim(),
    lista_precio: String(r.lista_precio || "").trim().toLowerCase()
  }));
  state.products = products.filter(r => isTrue(r.activo)).map(r => ({
    id: String(r.id || "").trim(),
    nombre: String(r.nombre || "").trim(),
    categoria: String(r.categoria || "Sin categoría").trim() || "Sin categoría",
    precios: {
      lista_1: Number(r.lista_1 || r.precio || 0),
      lista_2: Number(r.lista_2 || r.precio || 0),
      lista_3: Number(r.lista_3 || r.precio || 0)
    }
  }));
  state.ads = ads.filter(isActiveAd);
  state.support = Object.fromEntries(support.map(r => [String(r.clave || "").trim(), String(r.valor || "").trim()]));
}

function showView(name) {
  state.currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(name) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(name) {
  const modal = document.getElementById(`${name}Modal`);
  if (!modal) return;
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

function updateSupportChip() {
  const chipEl = $("#btnPancko");
  if (!chipEl) return;
  chipEl.textContent =
    state.support?.["chip_info"] ||
    state.support?.["chip info"] ||
    "M.J.S.";
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

  if (!state.seller) {
    nameEl.textContent = "Sin usuario";
    badge.classList.add("muted");
    return;
  }

  renderSellerName(nameEl, state.seller.nombre || "Usuario");
  badge.classList.remove("muted");
}

function renderPendingBadge() {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  const count = pending.length;
  const el = $("#pendingBadge");
  const card = $("#btnSyncPending");
  const cardCount = document.querySelector(".pending-count-vnext");
  const cardTitle = $("#pendingInfoTitle");
  const cardSub = $("#pendingInfoText");

  if (card) {
    card.classList.toggle("has-pending", count > 0);
    card.classList.remove("syncing");
  }

  if (cardCount) {
    if (!count) {
      cardCount.classList.add("hidden");
    } else {
      cardCount.classList.remove("hidden");
      cardCount.textContent = String(count);
    }
  }

  if (cardTitle) cardTitle.textContent = count ? `${count} pendiente${count === 1 ? "" : "s"}` : "Sin pendientes";
  if (cardSub) cardSub.textContent = count ? "Se enviarán con conexión" : "Pedidos sincronizados";

  if (!el) return;
  if (!count) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `${count} pendiente${count === 1 ? "" : "s"}`;
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

function clearBannerResumeTimer() {
  if (bannerCarousel.resumeTimer) {
    clearTimeout(bannerCarousel.resumeTimer);
    bannerCarousel.resumeTimer = null;
  }
}

function pauseBannerCarouselTemporarily() {
  const rows = getBannerRows();
  if (!rows || rows.length <= 1) return;

  bannerCarousel.isPausedByUser = true;
  stopBannerCarousel();
  clearBannerResumeTimer();

  bannerCarousel.resumeTimer = setTimeout(() => {
    bannerCarousel.isPausedByUser = false;
    startBannerCarousel(getBannerRows());
  }, bannerCarousel.resumeDelay);
}

function startBannerCarousel(rows) {
  stopBannerCarousel();
  bannerCarousel.delay = getCarouselDelay();
  if (!bannerCarousel.isPausedByUser) clearBannerResumeTimer();
  if (!rows || rows.length <= 1 || bannerCarousel.isPausedByUser) return;
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
  pauseBannerCarouselTemporarily();
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
    console.warn("[D9] publicidad: no llegó ninguna fila activa desde Sheets/cache.");
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
  const dotsHtml = rows.length > 1
    ? `<div class="banner-dots-d9" aria-label="Banners">${rows.map((_, i) => `<button type="button" class="banner-dot-d9 ${i === bannerCarousel.index ? "active" : ""}" data-banner-slide="${i}" aria-label="Banner ${i + 1}"></button>`).join("")}</div>`
    : "";

  console.log("[D9] publicidad slide:", {
    actual: bannerCarousel.index + 1,
    total: rows.length,
    tag, titulo, linea1, linea2, imgProducto, imgFull, link,
    tipo: imgFull ? "full" : "producto"
  });

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

  const nombre = esc(s.nombre || "M.J.S. Desarrollo APPs");
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
      lista_precio: state.seller.lista_precio || "lista_1"
    };
    state.activePriceList = state.selectedClient.lista_precio || state.seller.lista_precio || "lista_1";
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

  box.innerHTML = html;
}

function openCompanyInfo() {
  renderCompanyInfo();
  const modal = $("#companyModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
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
  if (state.seller?.rol === "cliente") return state.selectedClient?.lista_precio || state.seller.lista_precio || "lista_1";
  return state.activePriceList || "lista_1";
}

function priceLabel(key) {
  const labels = {
    lista_1: "Lista_1 · Contado",
    lista_2: "Lista_2 · Pueblos",
    lista_3: "Lista_3 · Vendedores"
  };
  return labels[key] || key || "Lista";
}

function productPrice(product) {
  const key = getActivePriceList();
  return Number(product?.precios?.[key] || 0);
}

function renderQuickLabels() {
  const isClient = state.seller?.rol === "cliente";
  const guestMode = !state.seller;
  $("#selectedClientLabel").textContent = isClient
    ? (state.selectedClient?.nombre_real || state.selectedClient?.nombre || "Cliente asignado")
    : (state.selectedClient
        ? (state.selectedClient.ocasional ? (state.selectedClient.nombre_real || "Cliente nuevo / ocasional") : state.selectedClient.nombre)
        : (guestMode ? "Cliente nuevo / ocasional" : "Seleccionar cliente"));
  $("#selectedCategoryLabel").textContent = state.selectedCategory || "Todas las categorías";
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
  $("#productModalHint").textContent = state.selectedCategory
    ? `Categoría activa: ${state.selectedCategory}. Podés marcar varios.`
    : "Todas las categorías. Podés marcar varios.";
}

function renderClients() {
  const term = $("#clientSearch").value.trim().toLowerCase();
  const list = $("#clientList");
  const canBrowseClients = state.seller?.rol === "vendedor";
  const filtered = canBrowseClients
    ? state.clients.filter(c => c.nombre.toLowerCase().includes(term)).slice(0, 80)
    : [];
  const occasionalBtn = `
    <button class="option-item option-button special-option" id="btnOccasionalClient" type="button">
      <strong>+ Cliente nuevo / ocasional</strong>
      <div class="option-meta">Cargar nombre, dirección, ciudad y teléfono para este pedido</div>
    </button>`;

  if (!canBrowseClients) {
    list.innerHTML = occasionalBtn;
    return;
  }

  list.innerHTML = filtered.length
    ? occasionalBtn + filtered.map(c => `
      <button class="option-item option-button ${state.selectedClient?.id === c.id ? "is-selected" : ""}" data-client-id="${esc(c.id)}" type="button">
        <strong>${esc(c.nombre)}</strong>
        <div class="option-meta">${esc(c.telefono || "Sin teléfono")} · ${esc(c.direccion || "Sin dirección")}</div>
      </button>`).join("")
    : occasionalBtn || '<div class="empty-state">No encontré clientes.</div>';
}

function selectClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  const previousClientId = state.selectedClient?.id || "";
  state.selectedClient = c;
  if (state.seller?.rol === "vendedor") {
    const previousActive = state.activePriceList || "lista_1";
    const nextList = c.lista_precio || "lista_1";
    const changedClient = previousClientId && String(previousClientId) !== String(c.id);
    const changedList = nextList !== previousActive;
    state.activePriceList = nextList;
    state.manualPriceOverride = false;
    if ((changedClient || changedList) && state.cart.length) {
      state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
      toast("Cambiaste de cliente. Se actualizaron los precios del pedido.");
    }
    refreshPricesAcrossApp();
  }
  renderSelectedClient();
  renderOrderPriceListControls();
  renderClients();
  renderQuickLabels();
  renderCart();
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
    const defaultList = state.selectedClient?.lista_precio || "lista_1";
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
  if (priceWrap) priceWrap.classList.toggle("hidden", !state.seller || state.seller?.rol !== "vendedor");
  closeModal("client");
  openModal("occasionalClient");
}

function saveOccasionalClient() {
  const nombre = $("#occasionalName").value.trim();
  const telefono = $("#occasionalPhone").value.trim();
  const direccion = $("#occasionalAddress").value.trim();
  const ciudad = $("#occasionalCity").value.trim();
  const lista = !state.seller ? "lista_1" : ($("#occasionalPriceList").value || "lista_1");

  if (!nombre) return toast("Cargá al menos el nombre del cliente.");

  const previousId = state.selectedClient?.id || "";
  const nextId = `ocasional_${Date.now()}`;
  state.selectedClient = {
    id: nextId,
    nombre: `NUEVO | ${nombre}${telefono ? ' | ' + telefono : ''}${direccion ? ' | ' + direccion : ''}${ciudad ? ' | ' + ciudad : ''}`,
    nombre_real: nombre,
    telefono,
    direccion: [direccion, ciudad].filter(Boolean).join(" · "),
    ciudad,
    lista_precio: lista,
    ocasional: true
  };
  state.guestClientDraft = state.selectedClient;
  if (!state.seller) {
    saveJSON(STORAGE_KEYS.guestClient, state.guestClientDraft);
  }
  state.activePriceList = lista;
  if (previousId && previousId !== nextId && state.cart.length) {
    state.cart = state.cart.map(item => ({ ...item, precio: productPrice(item) }));
    toast("Cliente ocasional cargado. Se actualizaron los precios del pedido.");
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

  if (!state.seller) {
    state.activePriceList = "lista_1";
    modeBox.classList.add("hidden");
    info.textContent = "Consulta general de precios.";
    renderPriceCategoryChips();
    return;
  }

  if (state.seller.rol === "vendedor") {
    modeBox.classList.remove("hidden");
    select.value = getActivePriceList();
    info.textContent = `Estás viendo ${priceLabel(getActivePriceList())}.`;
  } else {
    modeBox.classList.add("hidden");
    info.textContent = "Estás viendo tus precios asignados.";
  }

  renderPriceCategoryChips();
}

function renderPriceCategoryChips() {
  const wrap = $("#priceCategoryWrap");
  if (!wrap) return;
  const label = state.priceCategory || "Todas las categorías";
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

function renderPriceProducts() {
  const box = $("#priceProductsList");
  if (!box) return;
  const term = (state.priceSearch || "").toLowerCase();
  const cat = state.priceCategory;
  const filtered = state.products
    .filter(p => p.nombre.toLowerCase().includes(term) && (!cat || p.categoria === cat))
    .slice(0, 200);

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">No encontré productos para esa lista.</div>';
    return;
  }

  box.innerHTML = filtered.map(p => `
    <div class="price-row">
      <div class="price-row-main">
        <strong>${esc(p.nombre)}</strong>
        <div class="option-meta">${esc(p.categoria)}</div>
      </div>
      <div class="price-row-side">
        <strong>${money(productPrice(p))}</strong>
        ${state.seller?.rol === "vendedor" ? `<div class="mini-text">${priceLabel(getActivePriceList())}</div>` : ``}
      </div>
    </div>
  `).join("");
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
  return [...new Set(state.products.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderCategories() {
  const list = $("#categoryList");
  const cats = categoriesList();
  const allItem = `
    <button class="option-item option-button ${!state.selectedCategory ? "is-selected" : ""}" data-category="" type="button">
      <strong>Todas las categorías</strong>
      <div class="option-meta">Mostrar todos los productos activos</div>
    </button>`;
  list.innerHTML = allItem + cats.map(c => `
    <button class="option-item option-button ${state.selectedCategory === c ? "is-selected" : ""}" data-category="${esc(c)}" type="button">
      <strong>${esc(c)}</strong>
    </button>`).join("");
}

function selectCategory(category) {
  state.selectedCategory = category;
  $("#productSearch").value = "";
  renderCategories();
  renderProducts();
  renderQuickLabels();
  closeModal("category");
}

function renderProducts() {
  const term = $("#productSearch").value.trim().toLowerCase();
  const cat = state.selectedCategory;
  const list = $("#productList");
  const filtered = state.products
    .filter(p => p.nombre.toLowerCase().includes(term) && (!cat || p.categoria === cat))
    .slice(0, 200);
  list.innerHTML = filtered.length
    ? filtered.map(p => {
      const selected = state.cart.some(x => x.id === p.id);
      return `
        <button class="product-item product-picker ${selected ? "is-selected" : ""}" data-toggle-product="${esc(p.id)}" type="button">
          <div class="product-copy">
            <strong>${esc(p.nombre)}</strong>
            <div class="option-meta">${esc(p.categoria)}</div>
          </div>
          <div class="product-side">
            <div class="product-price">${money(productPrice(p))}</div>
            <div class="pick-state">${selected ? "Seleccionado" : "Tocar para agregar"}</div>
          </div>
        </button>`;
    }).join("")
    : '<div class="empty-state">No encontré productos.</div>';
}

function toggleProduct(id) {
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
  renderProducts();
  renderQuickLabels();
  renderCart();
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

  const clienteTexto = [
    source.cliente?.nombre_real || source.cliente?.nombre || "",
    source.cliente?.telefono || "",
    source.cliente?.direccion || (source.cliente?.ciudad || "")
  ].filter(Boolean).join(" | ");

  const lines = [
    "Pedido:",
    `Cliente: ${clienteTexto}`,
    source.vendedor?.nombre ? `Usuario: ${source.vendedor.nombre}` : "",
    ""
  ].filter(Boolean);

  source.carrito.forEach(item => {
    lines.push(`- ${item.nombre} x${item.cantidad} = ${money(item.precio * item.cantidad)}`);
  });

  lines.push("", `Total: ${money(source.total)}`);
  return lines.join("\n");
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
            <div class="mini-text">${money(item.precio)} c/u</div>
          </div>
          <button class="remove-btn" data-remove-id="${esc(item.id)}" type="button">Quitar</button>
        </div>
        <div class="qty-row">
          <button class="qty-btn" data-qty="minus" data-id="${esc(item.id)}" type="button">−</button>
          <div class="qty-value">${item.cantidad}</div>
          <button class="qty-btn" data-qty="plus" data-id="${esc(item.id)}" type="button">+</button>
          <div class="product-price">${money(item.precio * item.cantidad)}</div>
        </div>
      </div>`).join("");
  }
  $("#summaryItems").textContent = state.cart.reduce((acc, item) => acc + item.cantidad, 0);
  $("#summaryTotal").textContent = money(cartTotal());
  $("#messagePreview").textContent = generateMessageText();
}

function buildOrderPayload() {
  return {
    fecha: new Date().toISOString(),
    vendedor: state.seller,
    cliente: state.selectedClient,
    carrito: state.cart.map(x => ({ id: x.id, nombre: x.nombre, cantidad: x.cantidad, precio: x.precio })),
    total: cartTotal(),
    detalle: state.cart.map(x => `${x.nombre} x${x.cantidad}`).join(" | ")
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
    vendedor_id: payload?.vendedor?.id || "",
    vendedor: payload?.vendedor?.nombre || "",
    cliente: clienteTexto,
    items: (payload?.carrito || []).map(item => ({
      nombre: item.nombre,
      cantidad: Number(item.cantidad || 0),
      precio: Number(item.precio || 0)
    })),
    total: Number(payload?.total || 0),
    fecha: payload?.fecha || new Date().toISOString()
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
    return { ok: false, status: r.status, error: data?.error || raw || "Error HTTP", endpoint: url };
  }

  return { ok: !!data?.ok, data, endpoint: url };
}

async function trySendToWebhook(payload) {
  if (!Array.isArray(WEBHOOK_ENDPOINTS) || !WEBHOOK_ENDPOINTS.length) {
    return { ok: false, error: "Webhook no configurado" };
  }

  const sendPayload = buildWebhookPayload(payload);
  let lastError = null;

  for (const endpoint of WEBHOOK_ENDPOINTS) {
    try {
      const result = await sendToEndpoint(endpoint, sendPayload);
      if (result?.ok) return result;
      lastError = result || { ok: false, error: `Fallo en ${endpoint}`, endpoint };
    } catch (error) {
      lastError = { ok: false, error: String(error), endpoint };
    }
  }

  return lastError || { ok: false, error: "No se pudo enviar el pedido" };
}

function saveHistory(payload, status = "enviado", error = "") {
  const history = readJSON(STORAGE_KEYS.history, []);
  history.unshift({
    id: `${payload.fecha}_${payload.cliente?.id || payload.cliente?.nombre_real || payload.cliente?.nombre || "pedido"}_${Math.random().toString(36).slice(2, 8)}`,
    fecha: payload.fecha,
    vendedor: payload.vendedor?.nombre || "",
    cliente: payload.cliente?.nombre_real || payload.cliente?.nombre || "",
    cliente_id: payload.cliente?.id || "",
    detalle: payload.detalle,
    total: payload.total,
    status,
    items: (payload.carrito || []).map(x => ({
      id: x.id,
      nombre: x.nombre,
      cantidad: x.cantidad,
      precio: x.precio,
      subtotal: Number(x.precio || 0) * Number(x.cantidad || 0)
    })),
    error
  });
  saveJSON(STORAGE_KEYS.history, history.slice(0, 300));
  renderHistory();
}

function savePendingPayload(payload) {
  const pending = readJSON(STORAGE_KEYS.pending, []);
  pending.push(payload);
  saveJSON(STORAGE_KEYS.pending, pending);
  renderPendingBadge();
}

async function sendOrder() {
  if (state.isSending) return;
  if (validateOrder() !== true) return;

  state.isSending = true;
  const sendBtn = $("#btnSend");
  const pendingBtn = $("#btnSyncPending");
  setButtonBusy(sendBtn, true, "Enviando...", "Enviar pedido");

  try {
    const payload = buildOrderPayload();
    const waPhone = state.seller?.rol === "vendedor"
      ? (state.seller.wasap_report || confText("telefono_wa") || "")
      : (confText("telefono_wa") || "");
    const waText = generateMessageText(payload);

    if (!navigator.onLine) {
      savePendingPayload(payload);
      saveHistory(payload, "pendiente", "Sin conexión");
      renderPendingBadge();
      toast("Sin internet. Pedido guardado pendiente.");
      if (pendingBtn) pulseSuccess(pendingBtn, "Pendiente guardado", "Se enviará al recuperar conexión");
      return;
    }

    if (!openWhatsApp(waPhone, waText)) {
      toast("Falta telefono_wa en confi.");
      return;
    }

    trySendToWebhook(payload)
      .then(res => {
        if (!res || !res.ok) {
          savePendingPayload(payload);
          saveHistory(payload, "pendiente", res?.error || "No pude confirmar el envío");
          renderPendingBadge();
          console.warn("Pedido pendiente:", res?.error);
        } else {
          saveHistory(payload, "ok", "Enviado correctamente");
          renderPendingBadge();
          console.log("Pedido guardado OK");
        }
      })
      .catch(err => {
        savePendingPayload(payload);
        saveHistory(payload, "pendiente", String(err));
        renderPendingBadge();
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
    state.isSending = false;
    setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");
  }
}

function savePendingNow() {
  if (validateOrder() !== true) return;
  const payload = buildOrderPayload();
  savePendingPayload(payload);
  saveHistory(payload, "pendiente");
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
  toast("Pedido guardado como pendiente.");
}

async function syncPending() {
  if (state.isSyncing) return;

  const pending = readJSON(STORAGE_KEYS.pending, []);
  if (!navigator.onLine || !pending.length) {
    renderPendingBadge();
    if (!pending.length) toast("No hay pendientes.");
    return;
  }

  state.isSyncing = true;
  const syncBtn = $("#btnSyncPending");
  const syncBtnIsButton = syncBtn?.tagName === "BUTTON";
  if (syncBtnIsButton) {
    setButtonBusy(syncBtn, true, "Sincronizando...", syncBtn?.textContent?.trim() || "Pendientes", "Revisando y enviando pendientes");
  } else if (syncBtn) {
    syncBtn.classList.add("syncing");
  }

  try {
    const remaining = [];
    let sentCount = 0;

    for (const item of pending) {
      try {
        const result = await trySendToWebhook(item);
        if (result.ok) {
          sentCount++;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    saveJSON(STORAGE_KEYS.pending, remaining);
    renderPendingBadge();

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
      setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes");
    } else if (syncBtn) {
      syncBtn.classList.remove("syncing");
    }
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
    const detailHtml = items.length
      ? `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          ${items.map(prod => `
            <div class="history-product-row">
              <div class="history-product-main">
                <strong>${esc(prod.nombre)}</strong>
                <div class="mini-text">${money(prod.precio)} c/u</div>
              </div>
              <div class="history-product-side">
                <span class="history-qty">x${esc(prod.cantidad)}</span>
                <strong>${money(prod.subtotal ?? (Number(prod.precio || 0) * Number(prod.cantidad || 0)))}</strong>
              </div>
            </div>`).join('')}
        </div>`
      : `
        <div class="history-detail ${isOpen ? '' : 'hidden'}" id="detail-${esc(itemId)}">
          <div class="mini-text">${esc(item.detalle || 'Sin detalle cargado.')}</div>
        </div>`;

    return `
      <button class="history-item ${isOpen ? 'is-open' : ''}" data-history-id="${esc(itemId)}" type="button">
        <div class="history-head-row">
          <div class="history-copy">
            <strong>${esc(item.cliente)}</strong>
            <div class="mini-text">${new Date(item.fecha).toLocaleString("es-AR")}</div>
            <div class="mini-text history-meta-line">${esc(item.vendedor)} · ${esc(item.status || "")}${item.error ? ' · ' + esc(item.error) : ''}</div>
          </div>
          <div class="history-side">
            <div class="product-price">${money(item.total)}</div>
            <div class="history-toggle">${isOpen ? '▲' : '▼'}</div>
          </div>
        </div>
        ${detailHtml}
      </button>`;
  }).join('');
}

function toggleHistoryItem(id) {
  state.historyOpenId = state.historyOpenId === id ? null : id;
  renderHistory();
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
  state.isSending = false;
  state.isSyncing = false;
  const sendBtn = $("#btnSend");
  const syncBtn = $("#btnSyncPending");
  if (sendBtn) setButtonBusy(sendBtn, false, "Enviando...", "Enviar pedido");
  if (syncBtn?.tagName === "BUTTON") setButtonBusy(syncBtn, false, "Sincronizando...", syncBtn?.dataset?.idleLabel || "Pendientes");
  else if (syncBtn) syncBtn.classList.remove("syncing");
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function bind() {
  $("#btnGoOrder").addEventListener("click", () => showView("order"));
  $("#btnGoPrices").addEventListener("click", () => { renderPriceListControls(); renderPriceProducts(); showView("prices"); });
  $("#btnGoHistory").addEventListener("click", () => { renderHistory(); showView("history"); });
  const bannerEl = $("#bannerWrap");
  if (bannerEl) {
    bannerEl.addEventListener("pointerdown", pauseBannerCarouselTemporarily, { passive: true });
    bannerEl.addEventListener("touchstart", pauseBannerCarouselTemporarily, { passive: true });
  }

  $("#btnPancko").addEventListener("click", () => { renderSupport(); showView("support"); });
  $("#btnChangeSeller").addEventListener("click", () => openLogin(false));
  const companyBtn = $("#btnCompanyInfo");
  if (companyBtn) companyBtn.addEventListener("click", openCompanyInfo);
  const syncPendingEl = $("#btnSyncPending");
  if (syncPendingEl?.tagName === "BUTTON") syncPendingEl.addEventListener("click", syncPending);
  $("#btnLogin").addEventListener("click", loginSeller);
  $("#btnLogout").addEventListener("click", logoutSeller);
  $("#btnSaveOccasionalClient").addEventListener("click", saveOccasionalClient);
  $("#sellerUser").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#sellerPass").focus(); });
  $("#sellerPass").addEventListener("keydown", (e) => { if (e.key === "Enter") loginSeller(); });
  $("#btnCloseLogin").addEventListener("click", closeLogin);
  $("#clientSearch").addEventListener("input", renderClients);
  $("#productSearch").addEventListener("input", renderProducts);
  $("#priceSearch").addEventListener("input", (e) => { state.priceSearch = e.target.value.trim().toLowerCase(); renderPriceProducts(); });
  $("#priceListSelect").addEventListener("change", (e) => { state.activePriceList = e.target.value; refreshPricesAcrossApp(); });
  const orderPriceSelect = $("#orderPriceListSelect");
  if (orderPriceSelect) orderPriceSelect.addEventListener("change", (e) => {
    const next = e.target.value || "lista_1";
    if (state.activePriceList === next) {
      renderOrderPriceListControls();
      return;
    }
    state.activePriceList = next;
    state.manualPriceOverride = !!state.selectedClient && next !== (state.selectedClient.lista_precio || "lista_1");
    refreshPricesAcrossApp();
    if (state.cart.length) toast(`Se aplicó ${priceLabel(next)} al pedido.`);
  });
  $("#btnClearCart").addEventListener("click", clearCart);
  $("#btnSend").addEventListener("click", sendOrder);
  $("#btnSavePending").addEventListener("click", savePendingNow);
  $("#btnExportHistory").addEventListener("click", exportHistory);
  $("#btnRestoreHistory")?.addEventListener("click", openRestoreHistory);
  $("#restoreHistoryFile")?.addEventListener("change", restoreHistoryFromFile);
  $("#btnOpenClients").addEventListener("click", () => {
    if (state.seller?.rol === "cliente") return;
    if (!state.seller) {
      openOccasionalClientModal();
      return;
    }
    renderClients();
    openModal("client");
  });
  $("#btnOpenCategories").addEventListener("click", () => {
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    renderCategories();
    openModal("category");
  });
  $("#btnOpenProducts").addEventListener("click", () => {
    if (!state.selectedClient && !state.seller?.rol) {
      toast("Primero cargá los datos del comprador.");
      openOccasionalClientModal();
      return;
    }
    renderProducts();
    openModal("product");
  });

  document.addEventListener("click", (ev) => {
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
    if (toggle) toggleProduct(toggle.dataset.toggleProduct);

    const qty = ev.target.closest("[data-qty]");
    if (qty) updateQty(qty.dataset.id, qty.dataset.qty === "plus" ? 1 : -1);

    const remove = ev.target.closest("[data-remove-id]");
    if (remove) removeItem(remove.dataset.removeId);

    const historyItem = ev.target.closest("[data-history-id]");
    if (historyItem) toggleHistoryItem(historyItem.dataset.historyId);

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

function renderAll() {
  renderTop();
  renderNetwork();
  renderSellerBadge();
  renderPendingBadge();
  renderBanner();
  renderTicker();
  renderSupport();
  syncSessionUI();
  applyUserContext();
  renderQuickLabels();
  renderCategories();
  renderClients();
  renderSelectedClient();
  renderProducts();
  renderCart();
  renderPriceListControls();
  renderPriceProducts();
  renderHistory();
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

async function init() {
  bind();
  hydrateCacheState();
  hydrateGuestClient();
  hydrateSeller();
  renderAll();
  renderNetwork();
  await registerServiceWorker();

  if (!navigator.onLine) {
    return;
  }

  try {
    await loadAllData();
    persistCacheState();
    hydrateGuestClient();
    hydrateSeller();
    renderAll();
    renderNetwork();
    syncPending();
  } catch (error) {
    console.error(error);
    if (!state.products.length && !state.clients.length) {
      toast("No pude cargar los datos de la sheet.");
    }
    renderNetwork();
  }
}

init();