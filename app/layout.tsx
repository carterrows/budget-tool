import type { Metadata, Viewport } from "next";
import { sourceSans, sourceSerif } from "./fonts";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0f766e"
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=check,delete,edit,pie_chart,question_mark&display=swap"
        />
      </head>
      <body className={`${sourceSans.variable} ${sourceSerif.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
