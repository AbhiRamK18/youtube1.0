import React from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/lib/AuthContext";
import type { AppProps } from "next/app";
import "@/styles/globals.css";

export default function Home({ Component, pageProps }: AppProps) {
  return (
    <UserProvider>
      <div className="min-h-screen bg-white text-black">
        <title>Your-Tube Clone</title>
        <Header />
        <Toaster />
        <div className="flex">
          <Sidebar />
          <Component {...pageProps} />
        </div>
      </div>
    </UserProvider> 
  );
}
