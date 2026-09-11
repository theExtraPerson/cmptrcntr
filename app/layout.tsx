import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VivianFi — Intelligent Technology. Smarter Financial Futures.",
  description:
    "VivianFi is a next-generation technology and financial intelligence platform. Activate quantitative machines, earn daily returns, and grow with Direct Affiliate Bonuses.",
  icons: { icon: "/favicon.jpg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6d28d9",
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
