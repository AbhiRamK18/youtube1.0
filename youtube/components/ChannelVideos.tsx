"use client";

import { useState } from "react";
import VideoCard from "./videocard";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";
import type { Video } from "@/lib/types";

export default function ChannelVideos({
  videos,
  isOwner = false,
}: {
  videos: Video[];
  isOwner?: boolean;
}) {
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});

  const updateAccess = async (
    video: Video,
    premiumOnly: boolean,
    minimumPlan: string,
  ) => {
    setSavingVideo(video._id);
    setError("");
    try {
      await axiosInstance.patch(
        `/video/${video._id}/access`,
        { premiumOnly, minimumPlan },
        await getFirebaseAuthConfig(),
      );
      window.location.reload();
    } catch (updateError) {
      console.error("Unable to update video access:", updateError);
      setError("Unable to update this video's access. Please retry.");
    } finally {
      setSavingVideo(null);
    }
  };

  if (videos.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">No videos uploaded yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Videos</h2>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
        {videos.map((video) => (
          <div key={video._id} className="space-y-2">
            <VideoCard video={video} />
            {isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Minimum plan for ${video.videotitle}`}
                  value={selectedPlans[video._id] || video.minimumPlan || "bronze"}
                  disabled={savingVideo === video._id}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground [color-scheme:light] dark:[color-scheme:dark]"
                  onChange={(event) =>
                    setSelectedPlans((current) => ({
                      ...current,
                      [video._id]: event.target.value,
                    }))
                  }
                >
                  <option value="bronze">Bronze+</option>
                  <option value="silver">Silver+</option>
                  <option value="gold">Gold only</option>
                </select>
                <Button
                  size="sm"
                  variant={video.premiumOnly ? "outline" : "secondary"}
                  disabled={savingVideo === video._id}
                  onClick={() =>
                    void updateAccess(
                      video,
                      !video.premiumOnly,
                      selectedPlans[video._id] || video.minimumPlan || "bronze",
                    )
                  }
                >
                  {savingVideo === video._id
                    ? "Saving..."
                    : video.premiumOnly
                      ? "Make public"
                      : "Make premium"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}