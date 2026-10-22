"use client";

import { getVideoUrl } from "@/lib/videoUrl";

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath: string;
    filetype?: string;
  };
}

export default function VideoPlayer({ video }: VideoPlayerProps) {
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden">
      <video
        className="w-full h-full"
        controls
        poster={`/placeholder.svg?height=480&width=854`}
      >
        <source
          src={getVideoUrl(video.filepath)}
          type={video.filetype || "video/mp4"}
        />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}