import type { Metadata } from "next";
import { sourceSans, sourceSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Tool",
  description: "Self-hosted personal budgeting app",
  icons: {
    icon: "/favicon.svg"
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
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=delete,question_mark&display=optional"
        />
      </head>
      <body className={`${sourceSans.variable} ${sourceSerif.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
