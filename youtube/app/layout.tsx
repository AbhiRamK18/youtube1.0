import type { Metadata } from "next";
import type { ReactNode } from "react";
import ResponsiveShell from "@/components/ResponsiveShell";
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
              <Toaster />
              <ResponsiveShell>{children}</ResponsiveShell>
            </div>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}