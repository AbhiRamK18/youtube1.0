import LikedContent from "@/components/LikedContent";
import { Suspense } from "react";

export default function LikedPage() {
  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Liked videos</h1>
        <Suspense fallback={<div>Loading liked videos...</div>}>
          <LikedContent />
        </Suspense>
      </div>
    </main>
  );
}