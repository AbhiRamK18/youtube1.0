"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import axiosInstance from "@/lib/axiosinstance";
import { getVideoUrl } from "@/lib/videoUrl";
import type { Video } from "@/lib/types";

const SearchResult = ({ query }: { query: string }) => {
  const [result, setResult] = useState<{
    query: string;
    videos: Video[];
    error: boolean;
  }>({ query: "", videos: [], error: false });

  useEffect(() => {
    let cancelled = false;
    const searchQuery = query.trim().toLowerCase();

    if (!searchQuery) return;
    axiosInstance
      .get<Video[]>("/video/getall")
      .then((response) => {
        const allVideos = Array.isArray(response.data) ? response.data : [];
        const results = allVideos.filter(
          (video) =>
            video.videotitle?.toLowerCase().includes(searchQuery) ||
            video.videochanel?.toLowerCase().includes(searchQuery)
        );

        if (!cancelled) {
          setResult({ query: searchQuery, videos: results, error: false });
        }
      })
      .catch((error) => {
        console.error("Failed to search videos:", error);
        if (!cancelled) {
          setResult({ query: searchQuery, videos: [], error: true });
        }
      })

    return () => {
      cancelled = true;
    };
  }, [query]);

  const searchQuery = query.trim().toLowerCase();
  const currentResult = result.query === searchQuery ? result : null;

  if (!searchQuery) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-600">Enter a search term to find videos.</p>
      </div>
    );
  }

  if (!currentResult) {
    return <div className="py-12 text-center">Searching videos...</div>;
  }

  if (currentResult.error) {
    return (
      <div className="py-12 text-center">
        <p>Unable to load search results. Please try again.</p>
      </div>
    );
  }

  if (currentResult.videos.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">No results found</h2>
        <p className="text-gray-600">
          Try different keywords or remove search filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {currentResult.videos.map((video) => (
          <div key={video._id} className="group flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
              <Link href={`/watch/${video._id}`} className="block w-full shrink-0 sm:w-56 lg:w-80">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-100">
                  <video
                    src={getVideoUrl(video.filepath)}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1 rounded">
                    10:24
                  </div>
                </div>
              </Link>

              <div className="min-w-0 flex-1 py-1">
                <Link href={`/watch/${video._id}`}>
                  <h3 className="font-medium text-lg line-clamp-2 group-hover:text-blue-600 mb-2">
                    {video.videotitle}
                  </h3>
                </Link>

                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <span>                  {(video.views ?? 0).toLocaleString()} views</span>
                  <span>•</span>
                  <span>
                    {formatDistanceToNow(new Date(video.createdAt))} ago
                  </span>
                </div>

                <Link
                  href={`/channel/${video.uploader}`}
                  className="flex items-center gap-2 mb-2 hover:text-blue-600"
                >
                  <Avatar className="w-6h-6">
                    <AvatarImage src="/placeholder.svg?height=24&width=24" />
                    <AvatarFallback className="text-xs">
                      {video.videochanel[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-gray-600">
                    {video.videochanel}
                  </span>
                </Link>

                <p className="text-sm text-gray-700 line-clamp-2">
                  Sample video description that would show search-relevant
                  content and help users understand what the video is about
                  before clicking.
                </p>
              </div>
          </div>
        ))}
      </div>

      <div className="text-center py-8">
        <p className="text-gray-600">
          Showing {currentResult.videos.length} results for &quot;{query}&quot;
        </p>
      </div>
    </div>
  );
};

export default SearchResult;