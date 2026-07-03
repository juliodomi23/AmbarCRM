export { default } from "next-auth/middleware";

// Protege todo menos login, api/auth, estáticos y las rutas que validan su PROPIO token:
// api/wa (x-api-key de n8n/Evolution), api/v1 (token de bot estilo Chatwoot),
// api/cron (x-api-key) y api/media (sesión o token de bot, lo checa la ruta).
// manifest.json / sw.js / icon.svg van sin cookies (los pide el navegador para el PWA).
export const config = {
  matcher: ["/((?!login|api/auth|api/wa|api/v1|api/cron|api/media|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg).*)"]
};
