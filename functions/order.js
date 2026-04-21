const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyG1FnAOxm5tpUcvd4n6kvg9yHn6BMjoNOveUXggaEd6jAoDsyIo6RiYu06dPTxwTm3/exec";

export async function onRequestPost(context) {
  try {
    const data = await context.request.json();

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const text = await response.text();

    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { ok: false }; }

    const status = parsed.ok ? 200 : 500;
    return new Response(JSON.stringify({ ok: !!parsed.ok }), {
      status,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: false, error: "Método no permitido" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
}
