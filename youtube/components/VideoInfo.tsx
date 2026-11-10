"use client";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  Clock,
  Download,
  MoreHorizontal,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
import { downloadVideo } from "@/lib/downloadVideo";
import { toast } from "sonner";

interface VideoInfoProps {
  video: {
    _id: string;
    videotitle: string;
    videochanel: string;
    views: number;
    createdAt: string;
    Like?: number;
    Dislike?: number;
  };
}

const VideoInfo = ({ video }: VideoInfoProps) => {
  const [likeState, setLikeState] = useState({
    videoId: video._id,
    value: video.Like || 0,
  });
  const [dislikeState, setDislikeState] = useState({
    videoId: video._id,
    value: video.Dislike || 0,
  });
  const [reactionState, setReactionState] = useState({
    videoId: video._id,
    liked: false,
    disliked: false,
  });
  const likes = likeState.videoId === video._id ? likeState.value : video.Like || 0;
  const dislikes =
    dislikeState.videoId === video._id ? dislikeState.value : video.Dislike || 0;
  const isLiked = reactionState.videoId === video._id && reactionState.liked;
  const isDisliked = reactionState.videoId === video._id && reactionState.disliked;
  const setlikes = (update: (value: number) => number) =>
    setLikeState((current) => ({
      videoId: video._id,
      value: update(
        current.videoId === video._id ? current.value : video.Like || 0,
      ),
    }));
  const setDislikes = (update: (value: number) => number) =>
    setDislikeState((current) => ({
      videoId: video._id,
      value: update(
        current.videoId === video._id ? current.value : video.Dislike || 0,
      ),
    }));
  const setIsLiked = (liked: boolean) =>
    setReactionState((current) => ({
      videoId: video._id,
      liked,
      disliked: current.videoId === video._id && current.disliked,
    }));
  const setIsDisliked = (disliked: boolean) =>
    setReactionState((current) => ({
      videoId: video._id,
      liked: current.videoId === video._id && current.liked,
      disliked,
    }));
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { user } = useUser();
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const handleviews = async () => {
      if (user) {
        try {
          return await axiosInstance.post(`/history/${video._id}`, {
            userId: user?._id,
          });
        } catch (error) {
          return console.log(error);
        }
      } else {
        return await axiosInstance.post(`/history/views/${video?._id}`);
      }
    };
    handleviews();
  }, [user, video._id]);
  const handleLike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.liked) {
        if (isLiked) {
          setlikes((prev) => prev - 1);
          setIsLiked(false);
        } else {
          setlikes((prev) => prev + 1);
          setIsLiked(true);
          if (isDisliked) {
            setDislikes((prev) => prev - 1);
            setIsDisliked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };
  const handleWatchLater = async () => {
    try {
      const res = await axiosInstance.post(`/watch/${video._id}`, {
        userId: user?._id,
      });
      if (res.data.watchlater) {
        setIsWatchLater(!isWatchLater);
      } else {
        setIsWatchLater(false);
      }
    } catch (error) {
      console.log(error);
    }
  };
  const handleDislike = async () => {
    if (!user) return;
    try {
      const res = await axiosInstance.post(`/like/${video._id}`, {
        userId: user?._id,
      });
      if (!res.data.liked) {
        if (isDisliked) {
          setDislikes((prev) => prev - 1);
          setIsDisliked(false);
        } else {
          setDislikes((prev) => prev + 1);
          setIsDisliked(true);
          if (isLiked) {
            setlikes((prev) => prev - 1);
            setIsLiked(false);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };
  const handleDownload = async () => {
    if (!user) {
      toast.error("Sign in to download videos.");
      return;
    }
    setIsDownloading(true);
    try {
      await downloadVideo(video._id);
      toast.success("Your download is starting.");
    } catch (error: unknown) {
      console.error("Video download request failed:", error);
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      toast.error(message || "Unable to start this download.");
    } finally {
      setIsDownloading(false);
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="break-words text-xl font-semibold">{video.videotitle}</h1>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback>{video.videochanel[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="font-medium">{video.videochanel}</h3>
            <p className="text-sm text-gray-600">1.2M subscribers</p>
          </div>
          <Button className="min-h-11">Subscribe</Button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-full">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 rounded-l-full"
              onClick={handleLike}
            >
              <ThumbsUp
                className={`w-5 h-5 mr-2 ${
                  isLiked ? "fill-black text-black" : ""
                }`}
              />
              {likes.toLocaleString()}
            </Button>
            <div className="w-px h-6 bg-gray-300" />
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 rounded-r-full"
              onClick={handleDislike}
            >
              <ThumbsDown
                className={`w-5 h-5 mr-2 ${
                  isDisliked ? "fill-black text-black" : ""
                }`}
              />
              {dislikes.toLocaleString()}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`min-h-11 rounded-full bg-gray-100 ${
              isWatchLater ? "text-primary" : ""
            }`}
            onClick={handleWatchLater}
          >
            <Clock className="w-5 h-5 mr-2" />
            {isWatchLater ? "Saved" : "Watch Later"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-full bg-gray-100"
          >
            <Share className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-full bg-gray-100"
            disabled={isDownloading}
            onClick={() => void handleDownload()}
          >
            <Download className="w-5 h-5 mr-2" />
            {isDownloading ? "Preparing…" : "Download"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 rounded-full bg-gray-100"
          >
            <MoreHorizontal className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          <span>{video.views.toLocaleString()} views</span>
          <span>{formatDistanceToNow(new Date(video.createdAt))} ago</span>
        </div>
        <div className={`text-sm ${showFullDescription ? "" : "line-clamp-3"}`}>
          <p>
            Sample video description. This would contain the actual video
            description from the database.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 p-0 h-auto font-medium"
          onClick={() => setShowFullDescription(!showFullDescription)}
        >
          {showFullDescription ? "Show less" : "Show more"}
        </Button>
      </div>
    </div>
  );
};

export default VideoInfo;