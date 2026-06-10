import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/react"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "¿Cuánto debería costar tu remedio?",
  description: "Consulta precios, beneficios y plan de toma de tus medicamentos en Chile.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mis Remedios",
  },
  icons: {
    apple: "/icons/icon-192.png",
    icon:  "/icons/icon-192.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0B5966",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mis Remedios" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />

        {/* Botón compartir — fijo arriba a la derecha, visible en todas las páginas */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var btn = document.createElement('button');
            btn.title = 'Compartir app';
            btn.innerHTML = '📤';
            btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.25);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;line-height:1;';
            btn.addEventListener('click', function() {
              var url = 'https://turemedio.vercel.app';
              var texto = '💊 ¿Cuánto debería costar tu remedio? Compara precios en farmacias chilenas: ';
              if (navigator.share) {
                navigator.share({ title: '¿Cuánto debería costar tu remedio?', text: texto, url: url });
              } else {
                window.open('https://wa.me/?text=' + encodeURIComponent(texto + url), '_blank');
              }
            });
            document.addEventListener('DOMContentLoaded', function() {
              document.body.appendChild(btn);
            });
          })();
        `}} />

        {/* Registro del Service Worker */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('SW ok:', reg.scope) })
                  .catch(function(err) { console.log('SW error:', err) })
              })
            }
          `
        }} />
      </body>
    </html>
  )
}
