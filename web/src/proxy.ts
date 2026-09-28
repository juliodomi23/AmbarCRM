import authMiddleware from "next-auth/middleware";

export default authMiddleware;

// Protege todo menos login, api/auth y las rutas que validan su propio token.
export const config = {
  matcher: ["/((?!login|api/auth|api/wa|api/v1|api/cron|api/media|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon.svg).*)"]
};
