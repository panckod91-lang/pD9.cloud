
// === FIX ticker + soporte ===

function getKey(row){
  return (row.clave || "").toLowerCase().trim();
}

function aplicarSoporte(rows){
  let chip = "";
  rows.forEach(r=>{
    if(getKey(r)==="chip info" || getKey(r)==="chip_info"){
      chip = r.valor;
    }
  });
  if(chip){
    const el = document.getElementById("chipInfo");
    if(el) el.innerText = chip;
  }
}

function aplicarTicker(items, colors){
  const el = document.getElementById("ticker");
  if(!el) return;

  let html = "";
  items.forEach((t,i)=>{
    if(!t) return;
    const c = colors[i] || "#4dabf7";
    html += `<span style="color:${c};margin-right:30px">${t}</span>`;
  });

  el.innerHTML = html;
}
