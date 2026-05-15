import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "@/app/globals.css";

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = { title: "طباعة | MTC Electronics" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={ibmPlexSansArabic.variable}>
      <body className="font-sans bg-white">{children}</body>
    </html>
  );
}
