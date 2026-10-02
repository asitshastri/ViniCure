import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans } from "next/font/google";
import { ConnectionStatus } from "@/components/states/connection-status";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ViniCure | Online doctor consultations in India",
    template: "%s | ViniCure",
  },
  description: "Talk to verified doctors by video from home. Private, secure and built for India.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#146C6C",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${figtree.variable} ${notoSans.variable}`}>
      <body>
        <ToastProvider>
          {children}
          <ConnectionStatus />
        </ToastProvider>
      </body>
    </html>
  );
}
