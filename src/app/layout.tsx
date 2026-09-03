import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYF AI — Web Kokpit",
  description: "Multi-agent yazılım geliştirme sistemi — web arayüzü",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full h-screen flex flex-col overflow-hidden bg-[#0b0f19] text-gray-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
