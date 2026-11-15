import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Cormorant_Garamond,
  Caveat,
} from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  variable: "--font-handwriting",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Unsent Ocean — Bảo Tàng Tin Nhắn Chưa Gửi",
  description:
    "Nơi cất giữ những lá thư không người nhận. Hãy gửi lại biển đêm một lời chưa nói để lắng nghe tâm sự từ những tâm hồn đồng điệu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${plusJakarta.variable} ${cormorant.variable} ${caveat.variable} dark`}
    >
      <body className="font-sans bg-midnight text-slate-100 antialiased selection:bg-biocyan/30 selection:text-biocyan">
        {children}
      </body>
    </html>
  );
}
