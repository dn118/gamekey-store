import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameKey — цифровые товары для геймеров",
  description: "Ключи, пополнения и подписки с безопасной однократной выдачей.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
