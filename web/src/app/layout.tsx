import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Merugu Global ERP",
  description: "Digitalize, Optimize, Grow — Enterprise ERP & HRMS for Merugu Global (Digital Marketing, Technology & AI Solutions, Healthcare & Life Sciences)",
};

// Clear any legacy dark theme preference so the unified light theme always renders.
const lightThemeScript = `try{document.documentElement.classList.remove('dark');localStorage.removeItem('theme')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: lightThemeScript }} />
      </head>
      <body className="antialiased selection:bg-brand/15 selection:text-brand">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
