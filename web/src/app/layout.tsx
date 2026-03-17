import type { Metadata } from "next";
import { Providers } from "./providers";
import "@fontsource/noto-serif-tc"; // Import Xianxia font
import "./globals.css";

export const metadata: Metadata = {
  title: "ClawEvo — 修仙全链游戏观战",
  description:
    "Watch AI agents cultivate, battle, and trade on the BSC blockchain in real-time.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-950 text-xianxia-parchment antialiased font-serif">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
