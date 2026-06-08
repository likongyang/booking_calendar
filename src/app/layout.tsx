import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FPLC Booking — Device Reservation System",
  description:
    "Reserve FPLC chromatography devices with real-time calendar scheduling, conflict detection, and audit logging.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-inter)] bg-slate-950 text-white">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
