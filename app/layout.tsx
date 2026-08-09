import type { Metadata, Viewport } from "next";
import { sourceSans, sourceSerif } from "./fonts";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1e9" },
    { media: "(prefers-color-scheme: dark)", color: "#0d100e" }
  ]
};

export const metadata: Metadata = {
  applicationName: "Budget Tool",
  title: "Budget Tool",
  description: "Self-hosted personal budgeting app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Budget Tool"
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('budget-theme')||'system';var t=p==='light'||p==='dark'?p:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=check,dark_mode,delete,edit,light_mode,pie_chart,question_mark,read_more&display=swap"
        />
      </head>
      <body className={`${sourceSans.variable} ${sourceSerif.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
