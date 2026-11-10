import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getVideoUrl } from "@/lib/videoUrl";

interface RelatedVideosProps {
  videos: Array<{
    _id: string;
    videotitle: string;
    videochanel: string;
    filepath: string;
    views: number;
    createdAt: string;
  }>;
}
export default function RelatedVideos({ videos }: RelatedVideosProps) {
  return (
    <div className="space-y-2">
      {videos.map((video) => (
        <Link
          key={video._id}
          href={`/watch/${video._id}`}
          className="group flex min-w-0 gap-2"
        >
          <div className="relative w-[min(40%,10rem)] shrink-0 aspect-video overflow-hidden rounded bg-gray-100 sm:w-40">
            <video
              src={getVideoUrl(video.filepath)}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
              muted
              playsInline
              preload="metadata"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
              {video.videotitle}
            </h3>
            <p className="text-xs text-gray-600 mt-1">{video.videochanel}</p>
            <p className="text-xs text-gray-600">
              {video.views.toLocaleString()} views •{" "}
              {formatDistanceToNow(new Date(video.createdAt))} ago
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}