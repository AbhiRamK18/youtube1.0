import CategoryTabs from "@/components/category-tabs";
import Videosgrid from "@/components/Videosgrid";
import { Suspense } from "react";


export default function RootLayout() {
  return (
    <main className="flex-1 p-4">
      <CategoryTabs/>
      <Suspense fallback={<div>Loading videos...</div>}>
        <Videosgrid />
      </Suspense>
    </main>
  );
}
