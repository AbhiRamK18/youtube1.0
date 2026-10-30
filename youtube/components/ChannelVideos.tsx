"use client";

import { useState } from "react";
import VideoCard from "./videocard";
import { Button } from "./ui/button";
import axiosInstance from "@/lib/axiosinstance";
import { getFirebaseAuthConfig } from "@/lib/firebaseAuthConfig";

export default function ChannelVideos({
  videos,
  isOwner = false,
}: {
  videos: any[];
  isOwner?: boolean;
}) {
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});

  const updateAccess = async (
    video: any,
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {videos.map((video: any) => (
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