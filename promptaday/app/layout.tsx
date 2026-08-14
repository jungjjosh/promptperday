import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NavTabs from "@/components/NavTabs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "promptperday",
  description: "AI kills expression. Save yours with a prompt per day.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NavTabs />
        {children}
      </body>
    </html>
  );
}
