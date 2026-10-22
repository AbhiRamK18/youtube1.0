"use client";

import SearchResult from "@/components/SearchResult";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SearchResults() {
  const q = useSearchParams().get("q") ?? "";
  return (
    <div className="flex-1 p-4">
      <div className="max-w-6xl">
        {q.trim() && (
          <div className="mb-6">
            <h1 className="text-xl font-medium mb-4">
              Search results for "{q}"
            </h1>
          </div>
        )}
        <Suspense fallback={<div>Loading search results...</div>}>
          <SearchResult query={q} />
        </Suspense>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-4">Loading search...</div>}>
      <SearchResults />
    </Suspense>
  );
}