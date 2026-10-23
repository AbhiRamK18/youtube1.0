
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/videopplayer";
import axiosInstance from "@/lib/axiosinstance";

interface WatchVideo {
  _id: string;
  videotitle: string;
  filepath: string;
  filetype?: string;
  videochanel: string;
  views: number;
  createdAt: string;
  Like?: number;
  Dislike?: number;
}

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [currentVideo, setCurrentVideo] = useState<WatchVideo | null>(null);
  const [allVideos, setAllVideos] = useState<WatchVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchVideos() {
      setLoading(true);

      try {
        const res = await axiosInstance.get<WatchVideo[]>("/video/getall");
        const fetchedVideos = Array.isArray(res.data) ? res.data : [];

        if (!cancelled) {
          setAllVideos(fetchedVideos);
          setCurrentVideo(
            fetchedVideos.find((item) => item._id === id) ?? null
          );
        }
      } catch (error) {
        console.error("Failed to fetch videos:", error);

        if (!cancelled) {
          setCurrentVideo(null);
          setAllVideos([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (id) {
      fetchVideos();
    }

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <div className="p-6">Loading video...</div>;
  }

  if (!currentVideo) {
    return <div className="p-6">Video not found.</div>;
  }

  const currentVideoIndex = allVideos.findIndex(
    (item) => item._id === currentVideo._id,
  );
  const nextVideo = allVideos[currentVideoIndex + 1];

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl p-4">
        <div
          className={`grid grid-cols-1 gap-6 ${
            theaterMode ? "" : "lg:grid-cols-3"
          }`}
        >
          <div className={`space-y-4 ${theaterMode ? "" : "lg:col-span-2"}`}>
            <Videopplayer
              key={currentVideo._id}
              video={currentVideo}
              nextVideo={nextVideo}
              theaterMode={theaterMode}
              onTheaterModeChange={setTheaterMode}
            />
            <VideoInfo video={currentVideo} />
            <Comments videoId={id} />
          </div>

          <div className={`space-y-4 ${theaterMode ? "lg:grid lg:grid-cols-2 lg:gap-4" : ""}`}>
            <RelatedVideos videos={allVideos} />
          </div>
        </div>
      </div>
    </div>
  );
}
