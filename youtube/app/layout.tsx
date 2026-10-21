import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/lib/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Your-Tube Clone",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <div className="min-h-screen bg-white text-black">
            <Header />
            <Toaster />
            <div className="flex">
              <Sidebar />
              {children}
            </div>
          </div>
        </UserProvider>
      </body>
    </html>
  );
}