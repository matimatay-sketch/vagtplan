import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Familjen_Grotesk, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { NativeBridge } from "@/components/pwa/native-bridge";
import { brand } from "@/lib/brand";
import { HELP_BOOT_SCRIPT } from "@/lib/domain/help-mode";
import "./globals.css";

// "Døgnet": Atkinson Hyperlegible Next for reading, Familjen Grotesk for headings and times.
const body = Atkinson_Hyperlegible_Next({ variable: "--font-atkinson", subsets: ["latin"] });
const display = Familjen_Grotesk({ variable: "--font-familjen", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a22" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="da"
      suppressHydrationWarning
      className={`${body.variable} ${display.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Sets data-help before paint so "?" icons do not flash in or out. */}
        <script dangerouslySetInnerHTML={{ __html: HELP_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-right" richColors />
        <RegisterServiceWorker />
        <NativeBridge />
      </body>
    </html>
  );
}
