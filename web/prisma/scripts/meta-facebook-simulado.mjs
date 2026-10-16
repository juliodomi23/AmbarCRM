import assert from "node:assert/strict";

export async function graphSimulado(input, init) {
  const url = new URL(String(input));
  assert.equal(url.hostname, "graph.facebook.com");
  assert.ok(!/access_token=|client_secret=|code=/.test(url.search), "ninguna credencial en URLs");
  const body = new URLSearchParams(String(init?.body ?? ""));
  if (url.pathname.endsWith("/oauth/access_token")) {
    assert.equal(init?.method, "POST");
    assert.equal(body.get("client_id"), "123");
    assert.equal(body.get("client_secret"), "secreto-meta-simulado");
    if (body.get("code") === "permisos") return Response.json({ error: { code: 10, message: "TOKEN-SECRETO-no-exponer" } }, { status: 403 });
    if (body.has("code")) return Response.json({ access_token: `usuario-corto-${body.get("code")}` });
    assert.equal(body.get("grant_type"), "fb_exchange_token");
    return Response.json({ access_token: body.get("fb_exchange_token")?.replace("corto", "largo") });
  }
  const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
  if (url.pathname.endsWith("/me/accounts")) {
    assert.ok(token?.startsWith("usuario-largo-"));
    assert.equal(url.searchParams.get("fields"), "id,name,access_token,picture");
    const codigo = token.replace("usuario-largo-", "");
    const pagina = (id) => ({ id, name: `Página ${id}`, access_token: `pagina-privada-${id}`, picture: { data: { url: "https://scontent.xx.fbcdn.net/foto.jpg" } } });
    if (codigo === "paginacion") {
      if (url.searchParams.has("after")) return Response.json({ data: [pagina("90002")] });
      return Response.json({ data: [pagina("90001")], paging: { next: "https://inseguro.test/?access_token=NO-SE-DEBE-SEGUIR", cursors: { after: "cursor-seguro" } } });
    }
    return Response.json({ data: [pagina(`${codigo}1`), pagina(`${codigo}2`)] });
  }
  if (url.pathname.endsWith("/me")) return Response.json({ id: token?.replace("pagina-privada-", "") });
  if (url.pathname.endsWith("/subscribed_apps")) return Response.json({ success: true });
  throw new Error("Consulta Graph inesperada en simulación");
}

if (process.env.MESSENGER_GRAPH_SIMULADO === "1") {
  assert.equal(new URL(process.env.DATABASE_URL).port, "55450");
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => String(input).startsWith("https://graph.facebook.com/") ? graphSimulado(input, init) : original(input, init);
}
