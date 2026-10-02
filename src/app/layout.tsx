import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { ConnectionStatus } from "@/components/states/connection-status";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/i18n/client";
import { catalogs, getLocale } from "@/i18n/server";
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

// Hindi and Gujarati need their own fonts. The browser only downloads a file when a page uses its letters.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
  preload: false,
});
const notoGujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  variable: "--font-noto-gujarati",
  display: "swap",
  preload: false,
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${figtree.variable} ${notoSans.variable} ${notoDevanagari.variable} ${notoGujarati.variable}`}
    >
      <body>
        <I18nProvider locale={locale} messages={catalogs[locale]}>
          <ToastProvider>
            {children}
            <ConnectionStatus />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
