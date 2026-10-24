import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/lib/AuthContext";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your-Tube Clone",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <UserProvider>
            <div className="min-h-screen bg-background text-foreground">
              <Header />
              <Toaster />
              <div className="flex">
                <Sidebar />
                {children}
              </div>
            </div>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}