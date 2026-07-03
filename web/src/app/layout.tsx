import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

// Empaquetada en el build (self-hosted): no depende de Google Fonts en runtime.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "AmbarCRM",
  description: "CRM conversacional con WhatsApp — Ámbar Rojo",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" }
};

export const viewport = {
  themeColor: "#1E3A5F"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
