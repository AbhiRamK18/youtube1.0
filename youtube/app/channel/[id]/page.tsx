"use client";

import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [videos, setVideos] = useState<any[]>([]);
  const channel = user;

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get("/video/getall")
      .then((response) => {
        const allVideos = Array.isArray(response.data) ? response.data : [];
        if (!cancelled) {
          setVideos(
            allVideos.filter((video: any) => video.uploader === id)
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load channel videos:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channel} user={user} />
        <Channeltabs />
        <div className="px-4 pb-8">
          <VideoUploader channelId={id} channelName={channel?.channelname} />
        </div>
        <div className="px-4 pb-8">
          <ChannelVideos videos={videos} />
        </div>
      </div>
    </div>
  );
}