import CategoryTabs from "@/components/category-tabs";
import Videosgrid from "@/components/Videosgrid";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-w-0 flex-1 p-3 sm:p-4">
      <CategoryTabs />
      <Suspense fallback={<div>Loading videos...</div>}>
        <Videosgrid />
      </Suspense>
    </main>
  );
}