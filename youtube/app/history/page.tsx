import HistoryContent from "@/components/HistoryContent";
import { Suspense } from "react";

export default function HistoryPage() {
  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Watch history</h1>
        <Suspense fallback={<div>Loading...</div>}>
          <HistoryContent />
        </Suspense>
      </div>
    </main>
  );
}