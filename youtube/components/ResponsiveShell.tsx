"use client";

import { useState, type ReactNode } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function ResponsiveShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <Header onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex min-w-0">
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
      </div>
    </>
  );
}
