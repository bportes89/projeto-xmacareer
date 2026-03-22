import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XMA Career",
  description: "Plataforma de experiências STAR+D e People Analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
