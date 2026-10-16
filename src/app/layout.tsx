import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: "Computer Center — Connecting People With Technology",
  description: "Computer products, partnership plans, and account services in Kampala, Uganda.",
  icons: { icon: "/logo.jpg" },
  openGraph: {
    title: "Computer Center",
    description: "Computer Center — Connecting People With Technology. Review partnership terms before joining.",
    siteName: "Computer Center",
    type: "website",
    images: [{ url: "/logo.jpg", width: 800, height: 800, alt: "Computer Center logo" }],
  },
  twitter: {
    card: "summary",
    title: "Computer Center",
    description: "Computer Center — Connecting People With Technology. Review partnership terms before joining.",
    images: [{ url: "/logo.jpg", alt: "Computer Center logo" }],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f1f1f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="mx-auto min-h-screen max-w-md bg-background">{children}</div>
        </AuthProvider>
        <Toaster position="top-center" toastOptions={{ className: "toast-custom" }} />
      </body>
    </html>
  );
}
