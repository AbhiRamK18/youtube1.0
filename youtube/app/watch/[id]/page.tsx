
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/videopplayer";
import axiosInstance from "@/lib/axiosinstance";

export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [currentVideo, setCurrentVideo] = useState<any>(null);
  const [allVideos, setAllVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchVideos() {
      setLoading(true);

      try {
        const res = await axiosInstance.get("/video/getall");
        const fetchedVideos = Array.isArray(res.data) ? res.data : [];

        if (!cancelled) {
          setAllVideos(fetchedVideos);
          setCurrentVideo(
            fetchedVideos.find((item: any) => item._id === id) ?? null
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

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Videopplayer video={currentVideo} />
            <VideoInfo video={currentVideo} />
            <Comments videoId={id} />
          </div>

          <div className="space-y-4">
            <RelatedVideos videos={allVideos} />
          </div>
        </div>
      </div>
    </div>
  );
}
