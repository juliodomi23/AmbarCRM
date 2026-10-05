import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { authOptions } from "@/lib/auth";
import { getAjustes } from "@/lib/services/config";
import { DEFAULT_BRAND, normalizarMarca, variablesMarca } from "@/lib/brand";

// Empaquetada en el build (self-hosted): no depende de Google Fonts en runtime.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "AmbarCRM",
  description: "CRM conversacional con WhatsApp — Ámbar Rojo",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" }
};

export const viewport = { themeColor: "rgb(215, 8, 63)" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const marca = session?.user ? normalizarMarca(await getAjustes()) : DEFAULT_BRAND;
  const estiloMarca = variablesMarca(marca) as CSSProperties;
  return (
    <html lang="es" suppressHydrationWarning style={estiloMarca}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('ambar-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()` }} />
      </head>
      <body className={`${inter.variable} ${jakarta.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
