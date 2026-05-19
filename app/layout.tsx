import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MTC Electronics - نظام إدارة الأعمال",
  description: "نظام إدارة متكامل لمتجر MTC Electronics - نابلس، فلسطين",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${ibmPlexSansArabic.variable} h-full`}>
      <body className="min-h-full bg-[#f8fafc] text-[#1e293b]">{children}</body>
    </html>
  );
}
