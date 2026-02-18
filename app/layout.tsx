import type { Metadata } from "next";
import { sourceSans, sourceSerif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Tool",
  description: "Self-hosted personal budgeting app"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sourceSans.variable} ${sourceSerif.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
