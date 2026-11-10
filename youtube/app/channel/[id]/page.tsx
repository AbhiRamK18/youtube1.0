"use client";

import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import type { ChannelProfile, Video } from "@/lib/types";

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [videos, setVideos] = useState<Video[]>([]);
  const channel: ChannelProfile =
    user?._id === id
      ? user
      : {
          _id: id,
          channelname: videos.find((video) => video.uploader === id)?.videochanel,
        };

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get<Video[]>("/video/getall")
      .then((response) => {
        const allVideos = Array.isArray(response.data) ? response.data : [];
        if (!cancelled) {
          setVideos(
            allVideos.filter((video) => video.uploader === id)
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
    <div className="min-w-0 flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channel} user={user} />
        <Channeltabs />
        <div className="min-w-0 px-3 pb-8 sm:px-4">
          {user?._id === id && (
            <VideoUploader channelId={id} channelName={channel?.channelname} />
          )}
        </div>
        <div className="min-w-0 px-3 pb-8 sm:px-4">
          <ChannelVideos videos={videos} isOwner={user?._id === id} />
        </div>
      </div>
    </div>
  );
}