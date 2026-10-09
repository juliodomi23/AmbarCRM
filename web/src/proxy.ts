import authMiddleware from "next-auth/middleware";

export default authMiddleware;

// Protege todo menos login, api/auth y las rutas que validan su propio token.
export const config = {
  matcher: ["/((?!login|cotizacion|reservar|privacidad|terminos|eliminacion-datos|api/auth|api/meta|api/public|api/v1|api/cron|api/media|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png).*)"]
};
