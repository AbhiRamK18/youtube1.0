import React from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UserProvider } from "@/lib/AuthContext";

export default function Home() {
  return (
    <UserProvider>
<div className="min-h-screen bg-white text-black">
  <Header/>
  <Toaster/>
  <div className="flex">
    <Sidebar/>
  </div>
</div>
  </UserProvider> 
  );
}
