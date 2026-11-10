"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreVertical, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { getVideoUrl } from "@/lib/videoUrl";
import type { PlaylistItem } from "@/lib/types";

export default function HistoryContent() {
  const [history, setHistory] = useState<PlaylistItem[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const { user } = useUser();
  const loading = Boolean(user && loadedUserId !== user._id);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadHistory = async () => {
      try {
        const historyData = await axiosInstance.get<PlaylistItem[]>(`/history/${user._id}`);
        if (active) setHistory(historyData.data);
      } catch (error) {
        console.error("Error loading history:", error);
        if (active) setHistory([]);
      } finally {
        if (active) setLoadedUserId(user._id);
      }
    };
    void loadHistory();
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">
          Keep track of what you watch
        </h2>
        <p className="text-gray-600">
          Watch history is not viewable when signed out.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div>Loading history...</div>;
  }

  const handleRemoveFromHistory = async (historyId: string) => {
    try {
      console.log("Removing from history:", historyId);

      setHistory(history.filter((item) => item._id !== historyId));
    } catch (error) {
      console.error("Error removing from history:", error);
    }
  };

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No watch history yet</h2>
        <p className="text-gray-600">Videos you watch will appear here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{history.length} videos</p>
      </div>

      <div className="space-y-4">
        {history.map((item) => (
          <div key={item._id} className="group flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
            <Link href={`/watch/${item.videoid._id}`} className="block w-full shrink-0 sm:w-40">
              <div className="relative aspect-video overflow-hidden rounded bg-gray-100">
                <video
                  src={getVideoUrl(item.videoid?.filepath)}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  muted
                  playsInline
                  preload="metadata"
                />
              </div>
            </Link>

            <div className="flex-1 min-w-0">
              <Link href={`/watch/${item.videoid._id}`}>
                <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600 mb-1">
                  {item.videoid.videotitle}
                </h3>
              </Link>
              <p className="text-sm text-gray-600">
                {item.videoid.videochanel}
              </p>
              <p className="text-sm text-gray-600">
                {item.videoid.views.toLocaleString()} views •{" "}
                {formatDistanceToNow(new Date(item.videoid.createdAt))} ago
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Added {formatDistanceToNow(new Date(item.createdAt))} ago
              </p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleRemoveFromHistory(item._id)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Remove from watch history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}