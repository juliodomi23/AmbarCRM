/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Nadie puede meter el CRM en un iframe (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // El navegador no adivina MIME types (evita ejecutar uploads como scripts).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No filtrar URLs internas (con IDs de conversaciones) a sitios externos.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Solo pedimos micrófono (notas de voz); el resto de APIs sensibles, bloqueadas.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" }
        ]
      }
    ];
  }
};

export default nextConfig;
