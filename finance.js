// Funciones online de mostrador. La única contabilidad es la Sheet de Gestión.
const D9_FINANCE_URL = "https://script.google.com/macros/s/AKfycbync4MAmznqWR_vpsYpAOPE95goM6FN8oPfUR2bri0ZTeX3IOreJjyVFyub-3VsRSIO/exec";
const D9_FINANCE_KEY = "d9_finance_intentions";
const financeUiD9 = { revision: 0, client: null, account: null, collect: null };
const financeInFlightD9 = new Set();
const financeSaleSavesD9 = new Map();
const financeRoundD9 = value => Math.round(Number(value) * 100) / 100;
function financeMethodLabelD9(method) { return ({EFECTIVO:"Efectivo",TRANSFERENCIA:"Transferencia",CHEQUE:"Cheque",CUENTA_CORRIENTE:"Cuenta corriente"})[method] || "Condición no registrada · histórica"; }
function financeSessionD9() {
  const session = readJSON("d9_auth_session", null);
  if (!session?.token || String(session.uid) !== String(state.seller?.id)) {
    openLogin();
    throw new Error("Ingresá con tu usuario y clave para habilitar esta función online. Tus pedidos y pendientes se conservan.");
  }
  return session.token;
}
async function financePostD9(url, action, payload, withToken = true) {
  if (!navigator.onLine) throw new Error("Esta operación financiera requiere conexión. No se agregará a una cola offline.");
  const body = JSON.stringify({...payload, action, ...(withToken ? {token:financeSessionD9()} : {})});
  let response, data;
  try {
    response = await fetch(url, {method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body,cache:"no-store",redirect:"follow",signal:AbortSignal.timeout(60000)});
    data = JSON.parse(await response.text());
  } catch (_) { throw new Error(withToken ? "No se pudo confirmar el resultado. Usá Verificar resultado; no registres nuevamente con otro identificador." : "No se pudo validar el ingreso. Revisá la conexión y reintentá."); }
  if (!response.ok || !data.ok) { const error = new Error(data.error || `HTTP ${response.status}`); error.backendResponse = true; throw error; }
  return data;
}
function postPedidosAuthD9(action, payload) { return financePostD9(getApiBaseD9(), action, payload, false); }
function financeApiD9(action, payload) { return financePostD9(D9_FINANCE_URL, action, payload); }
function financeLedgerD9() { const rows = readJSON(D9_FINANCE_KEY, []); return Array.isArray(rows) ? rows : []; }
function financeOwnRecordsD9() { return financeLedgerD9().filter(row => String(row.uid) === String(state.seller?.id)); }
function financeStoreD9(record) {
  const rows = financeLedgerD9(), index = rows.findIndex(row => row.id === record.id && String(row.uid) === String(record.uid));
  if (index < 0) rows.unshift(record); else rows[index] = record;
  const pending = rows.filter(row => !row.confirmed), completed = rows.filter(row => row.confirmed).slice(0, 100);
  saveJSON(D9_FINANCE_KEY, [...pending, ...completed]);
  renderFinanceVerificationD9();
}
function financeForgetRejectedD9(record) {
  saveJSON(D9_FINANCE_KEY, financeLedgerD9().filter(row => !(row.id === record.id && String(row.uid) === String(record.uid))));
  renderFinanceVerificationD9();
}
function financeAcceptD9(record, result) {
  record.confirmed = true; record.result = result; record.error = "";
  if (record.kind === "VENTA") {
    Object.assign(record.payload, {medio_pago:result.medio_pago,finanzas_id:record.id,finance_result:result,telefono:result.telefono,fecha_txt:result.fecha});
    const alreadyLogged = record.logged;
    saveMostradorHistoryD9(record.payload, "registrada", "", {saved_sheet:true});
    if (!alreadyLogged) logAppEventD9("VENTA_MOSTRADOR_OK", mostradorLogDataD9(record.payload,"ok",`medio:${result.medio_pago}`));
  } else if (!record.logged) {
    logAppEventD9("COBRO_MOSTRADOR_OK", {vendedor_id:record.uid,vendedor:result.usuario,pedido_id:record.id,cliente:result.cliente,total:result.importe,resultado:"ok",detalle:`${result.numero} | ${financeMethodLabelD9(result.medio_pago)} | saldo:${money(result.saldo_actual)}`});
  }
  record.logged = true;
  financeStoreD9(record);
  return result;
}
async function financeSubmitD9(record) {
  if (financeInFlightD9.has(record.id)) throw new Error("Esta misma operación está siendo verificada. Podés seguir trabajando con otra.");
  financeSessionD9();
  if (!navigator.onLine) throw new Error("Necesitás conexión para confirmar. No se registró una operación offline.");
  const unresolved = financeOwnRecordsD9().find(row => !row.confirmed && row.id !== record.id && row.payload.cliente_id === record.payload.cliente_id);
  if (unresolved) throw new Error(`Primero verificá la operación anterior de este cliente: ${unresolved.id}.`);
  financeInFlightD9.add(record.id); financeStoreD9(record);
  try {
    const response = await financeApiD9(record.kind === "VENTA" ? "mostrador_venta" : "mostrador_cobro", record.payload);
    if (!response.confirmed) throw new Error("La operación todavía no está confirmada. Verificá su resultado.");
    return financeAcceptD9(record, response);
  } catch (error) {
    record.error = error.message; financeStoreD9(record);
    // Sólo una respuesta de error DEFINITIVA, sin intención persistida, permite
    // corregir datos. Un timeout nunca libera el identificador ni el snapshot.
    if (error.backendResponse) {
      try { const status = await financeApiD9("mostrador_estado", {intencion_id:record.id}); if (!status.exists) financeForgetRejectedD9(record); } catch (_) {}
    }
    throw error;
  } finally { financeInFlightD9.delete(record.id); }
}
async function financeVerifyD9(record) {
  if (financeInFlightD9.has(record.id)) return toast("Todavía se está confirmando esa operación.");
  financeInFlightD9.add(record.id);
  try {
    const status = await financeApiD9("mostrador_estado", {intencion_id:record.id});
    if (status.confirmed) { financeAcceptD9(record, status.result); toast("Operación confirmada. No se volvió a registrar."); return; }
    if(String(state.seller?.id)!==String(record.uid))return;
    showD9Confirm({message:status.exists ? "¿Completar el registro pendiente?" : "¿Reintentar la misma operación?",detail:`${record.payload.cliente} · ${record.id}. Se conservarán los datos y el identificador originales.`,okText:status.exists ? "Completar registro" : "Reintentar",cancelText:"Volver",onOk:async()=>{
      try {
        if(String(state.seller?.id)!==String(record.uid))return;
        if (status.exists) financeAcceptD9(record, await financeApiD9("mostrador_reconciliar",{intencion_id:record.id}));
        else await financeSubmitD9(record);
        toast("Operación confirmada. Ya podés consultar el saldo actualizado.");
      } catch(error) { toast(error.message); }
    }});
  } catch(error) { toast(error.message); }
  finally { financeInFlightD9.delete(record.id); }
}
function financeOverlayD9(id, title, body) {
  document.getElementById(id)?.remove();
  const overlay = document.createElement("div"); overlay.id=id; overlay.className="d9-confirm-overlay mostrador-flow-overlay-d9";
  overlay.innerHTML=`<div class="d9-confirm-box mostrador-flow-box-d9 finance-box-d9" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${body}</div>`;
  document.body.appendChild(overlay); return overlay;
}
function financePaymentFieldsD9(sale, total, account) {
  return `${account ? `<p>${esc(account.cliente.nombre)} · Saldo actual: <strong>${esc(money(account.saldo))}</strong></p><label>Importe cobrado<input name="importe" type="text" inputmode="decimal" required placeholder="0,00"></label><label>Aplicar a<select name="aplicacion"><option value="">A cuenta, sin operación específica</option>${account.aplicaciones.map(a=>`<option value="${esc(a.id)}" ${account.aplicaciones.length===1 ? "selected" : ""}>${esc(a.numero||a.id)} · ${esc(money(a.saldo))}</option>`).join("")}</select></label><small>A cuenta permite saldo a favor, como en Gestión.</small>` : `<p>Total de la Venta: <strong>${esc(money(total))}</strong></p>`}
    <label>${sale ? "Condición / medio de pago" : "Medio de pago"}<select name="medio_pago" required><option value="">Seleccionar…</option><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="CHEQUE">Cheque</option>${sale ? '<option value="CUENTA_CORRIENTE">Cuenta corriente</option>' : ""}</select></label>
    <div data-transfer class="hidden"><label>Referencia de transferencia (opcional)<input name="referencia" type="text"></label></div>
    <div data-cheque class="hidden finance-check-d9"><label>Banco<input name="banco" type="text"></label><label>Número de cheque<input name="numero" type="text"></label><label>Vencimiento<input name="fecha_vencimiento" type="date"></label><label>Librador (opcional)<input name="librador" type="text"></label></div>`;
}
function financeReadPaymentD9(form, sale) {
  const get=name=>form.elements.namedItem(name)?.value.trim()||"", method=get("medio_pago");
  if (!method) throw new Error("Elegí el medio/condición de pago.");
  const values={medio_pago:method,referencia:method==="TRANSFERENCIA"?get("referencia"):""};
  if (!sale) { values.importe=financeRoundD9(parseD9Number(get("importe"))); values.aplicacion=get("aplicacion"); if (!(values.importe>0)) throw new Error("Ingresá un importe mayor que cero."); }
  if (method==="CHEQUE") { values.cheque={banco:get("banco"),numero:get("numero"),fecha_vencimiento:get("fecha_vencimiento"),librador:get("librador")}; if (!values.cheque.banco||!values.cheque.numero||!values.cheque.fecha_vencimiento) throw new Error("Completá banco, número y vencimiento del cheque."); }
  return values;
}
function financeBindMethodD9(form) {
  form.elements.namedItem("medio_pago").addEventListener("change",()=>{
    const method=form.elements.namedItem("medio_pago").value;
    form.querySelector("[data-transfer]").classList.toggle("hidden",method!=="TRANSFERENCIA");
    form.querySelector("[data-cheque]").classList.toggle("hidden",method!=="CHEQUE");
  });
}
function financeChooseSaleMethodD9(payload) {
  return new Promise(resolve=>{
    const occasional=payload.cliente_ocasional===true;
    const payment=occasional?`<p class="mini-text">Cliente ocasional: sólo Venta cobrada totalmente en efectivo. Para Cuenta Corriente, transferencia o cheque, creá primero su ficha real.</p><label>Medio de pago<select name="medio_pago" required><option value="EFECTIVO">Efectivo · total cobrado</option></select></label><button type="button" data-save-client class="mostrador-flow-link-d9">Crear cliente real para otros medios</button>`:financePaymentFieldsD9(true,payload.total,null);
    const overlay=financeOverlayD9("financeSaleMethodD9","Registrar Venta",`<form><p>${esc(payload.cliente)}</p>${payment}<p class="mini-text">La Venta se registra online antes de ofrecer WhatsApp.</p><div class="finance-error-d9" role="alert"></div><div class="mostrador-flow-actions-d9"><button type="submit" class="mostrador-flow-primary-d9">Confirmar Venta</button><button type="button" data-cancel class="mostrador-flow-link-d9">Volver a la Venta</button></div></form>`),form=overlay.querySelector("form");
    if(!occasional)financeBindMethodD9(form);
    if(occasional)form.querySelector("[data-save-client]").onclick=()=>{overlay.remove();resolve(null);openMostradorClientFormD9("sale");};
    form.querySelector("[data-cancel]").onclick=()=>{overlay.remove();resolve(null);};
    form.onsubmit=event=>{event.preventDefault();try{const result=financeReadPaymentD9(form,true);if(occasional&&result.medio_pago!=="EFECTIVO")throw new Error("El cliente ocasional sólo admite efectivo total. Creá una ficha real para otros medios.");overlay.remove();resolve(result);}catch(error){form.querySelector("[role=alert]").textContent=error.message;}};
  });
}
function financeSaleIsCurrentD9(payload) {
  return String(state.seller?.id)===String(payload.usuario_id) && state.mostradorVentaDraftId===payload.venta_id && mostradorFingerprintD9()===payload.fingerprint;
}
async function financeSaveCurrentSaleD9() {
  if (!isMostradorD9()) throw new Error("Esta función requiere rol mostrador.");
  financeSessionD9();
  if (!navigator.onLine) throw new Error("La Venta financiera requiere conexión. Conservá el carrito y registrala al volver a tener señal.");
  const snapshot=buildMostradorPayloadD9();
  snapshot.items.forEach(item=>item.subtotal=financeRoundD9(item.cantidad*item.precio));
  snapshot.total=snapshot.total_venta=financeRoundD9(snapshot.items.reduce((sum,item)=>sum+item.subtotal,0));
  snapshot.internal_whatsapp=state.seller?.wasap_report||getDefaultWhatsAppD9();
  if(financeSaleSavesD9.has(snapshot.venta_id))return financeSaleSavesD9.get(snapshot.venta_id);
  const saving=financeSaveSaleSnapshotD9(snapshot);financeSaleSavesD9.set(snapshot.venta_id,saving);
  try{return await saving;}finally{financeSaleSavesD9.delete(snapshot.venta_id);}
}
async function financeSaveSaleSnapshotD9(snapshot) {
  let record=financeOwnRecordsD9().find(row=>row.id===snapshot.venta_id);
  if (!record) {
    const payment=await financeChooseSaleMethodD9(snapshot); if (!payment) return null;
    if (!financeSaleIsCurrentD9(snapshot)) throw new Error("La Venta cambió mientras elegías el pago. Revisá el carrito antes de confirmar.");
    Object.assign(snapshot,payment);
    record={id:snapshot.venta_id,uid:String(snapshot.usuario_id),kind:"VENTA",payload:JSON.parse(JSON.stringify(snapshot)),confirmed:false};
  }
  if (!record.confirmed) await financeSubmitD9(record);
  return {ok:true,payload:record.payload,res:record.result};
}
function renderFinanceHomeD9() {
  const sale=document.getElementById("btnGoMostrador"); if (!sale) return;
  const uid=String(state.seller?.id||"");
  if(financeUiD9.uid!==uid){financeUiD9.uid=uid;financeUiD9.revision++;financeUiD9.client=null;financeUiD9.account=null;financeUiD9.collect=null;document.getElementById("financeCobroD9")?.remove();document.querySelector("#financeSaleMethodD9 [data-cancel]")?.click();closeMostradorOverlayD9("mostradorWhatsAppOverlayD9");closeMostradorOverlayD9("mostradorPhoneOverlayD9");const block=document.getElementById("financeAccountD9");if(block)block.innerHTML="";const input=document.getElementById("financeClientSearchD9");if(input)input.value="";}
  let button=document.getElementById("btnGoFinanceD9");
  if (!button) {
    button=document.createElement("button");button.id="btnGoFinanceD9";button.type="button";button.className="cta-main-vnext finance-home-d9 hidden";
    button.innerHTML='<span class="cta-icon-vnext">💳</span><span class="cta-copy-vnext"><strong>CUENTA CORRIENTE</strong><small>Consultar saldo y registrar cobros</small></span><span class="cta-arrow-vnext">›</span>';
    sale.after(button);button.onclick=openFinanceAccountD9;
  }
  button.classList.toggle("hidden",!isMostradorD9());
  if (!isMostradorD9()) {financeUiD9.revision++;financeUiD9.client=null;financeUiD9.account=null;financeUiD9.collect=null;document.getElementById("financeCobroD9")?.remove();}
}
function openFinanceAccountD9() {
  try {financeSessionD9();} catch(error) {return toast(error.message);}
  if (!isMostradorD9()) return;
  let view=document.getElementById("view-finance");
  if (!view) {
    view=document.createElement("section");view.id="view-finance";view.className="view";
    view.innerHTML='<div class="card section-block"><div class="section-title-row between"><h2>Cuenta corriente</h2><button type="button" data-finance-home class="link-btn">Inicio</button></div><p class="mini-text">Saldo real de D9 Gestión · requiere conexión</p><input id="financeClientSearchD9" class="input" type="search" placeholder="Buscar clientes autorizados…"><div id="financeClientsD9" class="option-list"></div></div><div id="financeAccountD9"></div><div id="financeVerificationD9" class="card section-block"></div>';
    document.querySelector("main").appendChild(view);
    view.querySelector("[data-finance-home]").onclick=()=>{financeUiD9.revision++;financeUiD9.collect=null;document.getElementById("financeCobroD9")?.remove();showView("home");};
    view.querySelector("#financeClientSearchD9").oninput=renderFinanceClientsD9;
  }
  showView("finance");renderFinanceClientsD9();renderFinanceVerificationD9();
}
function renderFinanceClientsD9() {
  const list=document.getElementById("financeClientsD9");if (!list) return;
  const term=String(document.getElementById("financeClientSearchD9")?.value||"").trim().toLowerCase();
  const clients=mostradorClientsD9().filter(client=>`${client.id} ${client.nombre}`.toLowerCase().includes(term)).sort((a,b)=>a.nombre.localeCompare(b.nombre,"es")).slice(0,20);
  list.innerHTML=clients.map(client=>{const selected=String(financeUiD9.client?.id||"")===String(client.id);return `<button type="button" data-finance-client="${esc(client.id)}" class="option-item${selected?" finance-selected-client-d9":""}" ${selected?'aria-current="true"':""}><strong>${esc(client.nombre)}</strong><small>${selected?"Cliente seleccionado · ":""}${esc([client.direccion,client.ciudad].filter(Boolean).join(" · ")||"Sin dirección registrada")}</small></button>`}).join("")||'<p class="mini-text">Sin clientes para esta búsqueda.</p>';
  list.querySelectorAll("[data-finance-client]").forEach(button=>button.onclick=()=>financeSelectClientD9(button.dataset.financeClient));
}
async function financeSelectClientD9(id) {
  const client=mostradorClientsD9().find(c=>String(c.id)===String(id));if (!client) return;
  const revision=++financeUiD9.revision,uid=String(state.seller?.id);
  financeUiD9.client=client;financeUiD9.account=null;financeUiD9.collect=null;document.getElementById("financeCobroD9")?.remove();
  const search=document.getElementById("financeClientSearchD9");if(search)search.value=client.nombre;renderFinanceClientsD9();
  const block=document.getElementById("financeAccountD9");block.innerHTML='<div class="card section-block">Consultando cuenta…</div>';
  try {
    const response=await financeApiD9("mostrador_cuenta",{cliente_id:client.id});
    if (revision!==financeUiD9.revision||uid!==String(state.seller?.id)||state.currentView!=="finance") return;
    financeUiD9.account=response.cuenta;renderFinanceAccountD9();
  } catch(error) {if(revision===financeUiD9.revision&&uid===String(state.seller?.id))block.innerHTML=`<div class="card section-block finance-error-d9">${esc(error.message)}</div>`;}
}
function renderFinanceAccountD9() {
  const account=financeUiD9.account,block=document.getElementById("financeAccountD9");if (!account||!block) return;
  block.innerHTML=`<div class="card section-block"><div class="section-title-row between"><h3>${esc(account.cliente.nombre)}</h3><div class="finance-account-head-actions-d9"><button type="button" data-change-client class="link-btn">Cambiar cliente</button><button type="button" data-refresh class="link-btn">Actualizar</button></div></div><div class="finance-balance-d9"><small>${account.saldo<0?"Saldo a favor":"Saldo actual"}</small><strong>${esc(money(Math.abs(account.saldo)))}</strong></div><p class="mini-text">Actualizado: ${esc(account.timestamp)}</p><div class="finance-account-actions-d9"><button data-collect type="button" class="primary-btn">COBRAR</button><button data-send type="button" class="secondary-btn">ENVIAR POR WHATSAPP</button></div><h3>Movimientos recientes</h3><div class="finance-movements-d9">${account.movimientos.map(m=>`<article><div><strong>${esc(m.tipo.replace(/_/g," "))} · ${esc(m.documento_numero||"")}</strong><small>${esc(m.fecha)} · ${esc(m.detalle||"")}</small></div><div class="${Number(m.haber)>0?"finance-credit-d9":"finance-debit-d9"}"><b>${Number(m.haber)>0?"−":"+"}${esc(money(Number(m.haber)>0?m.haber:m.debe))}</b><small>Saldo: ${esc(money(m.saldo))}</small></div></article>`).join("")||'<p class="mini-text">Sin movimientos.</p>'}</div></div>`;
  block.querySelector("[data-refresh]").onclick=()=>financeSelectClientD9(account.cliente.id);
  block.querySelector("[data-change-client]").onclick=()=>{financeUiD9.revision++;financeUiD9.client=null;financeUiD9.account=null;financeUiD9.collect=null;document.getElementById("financeCobroD9")?.remove();block.innerHTML="";const search=document.getElementById("financeClientSearchD9");if(search){search.value="";search.focus()}renderFinanceClientsD9();};
  block.querySelector("[data-collect]").onclick=()=>financeOpenCobroD9(account);
  block.querySelector("[data-send]").onclick=()=>financeSendStatementD9(account);
}
function financeCobroIsCurrentD9(record) {return financeUiD9.collect===record.id&&String(state.seller?.id)===String(record.uid)&&String(financeUiD9.client?.id)===record.payload.cliente_id&&state.currentView==="finance";}
function financeOpenCobroD9(account) {
  const pending=financeOwnRecordsD9().find(row=>!row.confirmed&&row.payload.cliente_id===account.cliente.id);
  if (pending) {renderFinanceVerificationD9();return toast("Verificá primero la operación financiera pendiente de este cliente.");}
  const uid=String(state.seller?.id),id=`CO-${uid}-${Date.now().toString(36)}-${randomCryptoD9(6)}`;
  financeUiD9.collect=id;
  const overlay=financeOverlayD9("financeCobroD9","Registrar cobro",`<form>${financePaymentFieldsD9(false,0,account)}<div role="alert" class="finance-error-d9"></div><div class="mostrador-flow-actions-d9"><button type="submit" class="mostrador-flow-primary-d9">Confirmar cobro</button><button type="button" data-cancel class="mostrador-flow-link-d9">Volver</button></div></form>`),form=overlay.querySelector("form");
  financeBindMethodD9(form);form.querySelector("[data-cancel]").onclick=()=>{if(financeUiD9.collect===id)financeUiD9.collect=null;overlay.remove();};
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector("[type=submit]");if(button.disabled)return;
    let record;
    try {
      const payment=financeReadPaymentD9(form,false),application=account.aplicaciones.find(a=>a.id===payment.aplicacion);
      if(application&&payment.importe>application.saldo+.01)throw new Error("El cobro supera el saldo de la operación elegida. Elegí A cuenta para dejar crédito.");
      const payload={...payment,intencion_id:id,usuario_id:uid,usuario:state.seller?.nombre||"",cliente_id:account.cliente.id,cliente:account.cliente.nombre,internal_whatsapp:state.seller?.wasap_report||getDefaultWhatsAppD9()};
      record={id,uid,kind:"COBRO",payload:JSON.parse(JSON.stringify(payload)),confirmed:false};
      button.disabled=true;button.textContent="Confirmando…";
      const result=await financeSubmitD9(record);
      if(!financeCobroIsCurrentD9(record))return toast(`Cobro ${result.numero} confirmado. Tu trabajo actual no se modificó.`);
      overlay.remove();financeUiD9.collect=null;
      const revision=++financeUiD9.revision;
      try {const updated=await financeApiD9("mostrador_cuenta",{cliente_id:account.cliente.id});if(revision===financeUiD9.revision&&uid===String(state.seller?.id)&&state.currentView==="finance"){financeUiD9.account=updated.cuenta;renderFinanceAccountD9();}}catch(_){if(revision===financeUiD9.revision&&uid===String(state.seller?.id)&&state.currentView==="finance"){financeUiD9.account=null;document.getElementById("financeAccountD9").innerHTML='<div class="card section-block">Cobro confirmado. Actualizá la cuenta para consultar movimientos recientes.</div>';}}
      if(revision===financeUiD9.revision&&uid===String(state.seller?.id)&&state.currentView==="finance")financeShowReceiptD9(record);
    } catch(error) {
      form.querySelector("[role=alert]").textContent=error.message;
      if(record&&financeOwnRecordsD9().some(row=>row.id===id&&!row.confirmed)){button.disabled=false;button.textContent="Verificar resultado en Cuenta corriente";button.onclick=event=>{event.preventDefault();overlay.remove();if(financeUiD9.collect===id)financeUiD9.collect=null;renderFinanceVerificationD9();};}
      else {button.disabled=false;button.textContent="Confirmar cobro";}
    }
  };
}
function financeReceiptTextD9(result) {
  const lines=["DISTRIBUIDORA D9","RECIBO DE COBRO",`Recibo: ${result.numero}`,"",`Cliente: ${result.cliente}`,`Fecha: ${result.fecha}`,`Recibido por: ${result.usuario}`,"",`Saldo anterior: ${money(result.saldo_anterior)}`,`Cobro: −${money(result.importe)}`,`Medio: ${financeMethodLabelD9(result.medio_pago)}`];
  if(result.cheque)lines.push(`Cheque: ${result.cheque.banco} · ${result.cheque.numero} · Vto. ${result.cheque.fecha_vencimiento}`);
  lines.push("",`SALDO ACTUAL: ${money(result.saldo_actual)}`,"Comprobante interno no fiscal.");return lines.join("\n");
}
function financeShowReceiptD9(record) {
  if(String(state.seller?.id)!==String(record.uid))return;
  const result=record.result;if(!record.confirmed||!result)return;
  const client=mostradorClientsD9().find(c=>String(c.id)===result.cliente_id)||{id:result.cliente_id,nombre:result.cliente,telefono:result.telefono};
  const payload={...record.payload,cliente:result.cliente,telefono:client.telefono||result.telefono,total:result.importe};
  const revision=financeUiD9.revision;
  const show=phone=>{if(String(state.seller?.id)!==String(record.uid)||revision!==financeUiD9.revision||state.currentView!=="finance")return;showMostradorWhatsAppDestinationsD9({payload:{...payload,telefono:phone},text:financeReceiptTextD9(result),saveResult:{ok:true},allowClient:true,optional:true,title:"Cobro registrado correctamente",status:`Recibo ${result.numero} · Saldo actual: ${money(result.saldo_actual)}`,onFinish:()=>closeMostradorOverlayD9("mostradorWhatsAppOverlayD9")});};
  if(whatsappDestinationDigitsD9(payload.telefono).length<10)showMostradorPhonePromptD9(client,{onContinue:allow=>show(allow?state.clients.find(c=>String(c.id)===result.cliente_id)?.telefono||"":""),onCancel:()=>{}});
  else show(payload.telefono);
}
async function financeSendStatementD9(account) {
  const revision=financeUiD9.revision,uid=String(state.seller?.id);
  try {
    const response=await financeApiD9("mostrador_cuenta",{cliente_id:account.cliente.id});
    if(revision!==financeUiD9.revision||uid!==String(state.seller?.id)||state.currentView!=="finance")return;
    const current=response.cuenta;financeUiD9.account=current;renderFinanceAccountD9();
    const lines=["DISTRIBUIDORA D9","ESTADO DE CUENTA","",`Cliente: ${current.cliente.nombre}`,`Fecha: ${current.timestamp}`,"","Últimos movimientos:",...current.movimientos.slice(0,10).reverse().map(m=>`${m.fecha} · ${m.tipo.replace(/_/g," ")} ${m.documento_numero||""} · ${Number(m.haber)>0?"−":"+"}${money(Number(m.haber)>0?m.haber:m.debe)}`),"",`SALDO ACTUAL: ${money(current.saldo)}`],text=lines.join("\n");
    const send=phone=>{if(revision===financeUiD9.revision&&uid===String(state.seller?.id)&&state.currentView==="finance"&&whatsappDestinationDigitsD9(phone).length>=10)openWhatsApp(whatsappDestinationDigitsD9(phone),text);};
    if(whatsappDestinationDigitsD9(current.cliente.telefono).length>=10)send(current.cliente.telefono);
    else showMostradorPhonePromptD9(financeUiD9.client,{onContinue:allow=>{if(allow)send(state.clients.find(c=>String(c.id)===current.cliente.id)?.telefono||"");},onCancel:()=>{}});
  } catch(error) {if(revision===financeUiD9.revision)toast(error.message);}
}
function renderFinanceVerificationD9() {
  const block=document.getElementById("financeVerificationD9");if(!block)return;
  const own=financeOwnRecordsD9(),pending=own.filter(row=>!row.confirmed),receipts=own.filter(row=>row.confirmed&&row.result?.recibo_id).slice(0,10);
  block.innerHTML=`<h3>Verificación y comprobantes</h3><small>Esto no es una cola offline. Cada verificación conserva la intención original.</small>${pending.map(row=>`<div class="finance-verification-row-d9"><div><strong>${esc(row.payload.cliente)}</strong><small>${esc(row.kind)} · ${esc(row.id)}</small><small>${esc(row.error||"Esperando confirmación")}</small></div><button type="button" class="secondary-btn" data-verify="${esc(row.id)}">Verificar resultado</button></div>`).join("")||'<p class="mini-text">Sin operaciones pendientes de verificar.</p>'}${receipts.map(row=>`<div class="finance-verification-row-d9"><div><strong>${esc(row.result.numero)} · ${esc(row.result.cliente)}</strong><small>${esc(money(row.result.importe))} · ${esc(row.result.fecha)}</small></div><button type="button" class="secondary-btn" data-receipt="${esc(row.id)}">Ver recibo / WhatsApp</button></div>`).join("")}`;
  block.querySelectorAll("[data-verify]").forEach(button=>button.onclick=()=>financeVerifyD9(own.find(row=>row.id===button.dataset.verify)));
  block.querySelectorAll("[data-receipt]").forEach(button=>button.onclick=()=>financeShowReceiptD9(own.find(row=>row.id===button.dataset.receipt)));
}
document.addEventListener("DOMContentLoaded",renderFinanceHomeD9);
