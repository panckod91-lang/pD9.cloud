
// FIX CHIP + TICKER

function renderSupport(){
  const el = document.getElementById("chipInfo");
  if(!el || !state.support) return;

  const val = state.support["chip_info"] || state.support["chip info"];
  if(val){
    el.textContent = val;
  }
}

// ticker FIX completo
function renderTicker(){
  const el = document.getElementById("ledTicker");
  if(!el) return;

  const texts = confParts("ticker_texto");
  const colors = confColors("ticker_color");

  let full = "";

  texts.forEach((t,i)=>{
    if(!t) return;
    const c = colors[i] || "#4dabf7";
    full += `<span style="color:${c};margin-right:40px">${t}</span>`;
  });

  // DUPLICAMOS para loop largo
  el.innerHTML = full + full;
}
