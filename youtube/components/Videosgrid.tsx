"use client";
import React, { useEffect, useState } from "react";
import Videocard from "./videocard";
import axiosInstance from "@/lib/axiosinstance";
import { Button } from "./ui/button";

type Video = {
  _id: string;
};

const Videogrid = () => {
  const [videos, setvideo] = useState<Video[]>([]);
  const [loading, setloading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get<Video[]>("/video/getall")
      .then((res) => {
        if (!Array.isArray(res.data)) {
          throw new Error("Video API returned an invalid response.");
        }
        if (!cancelled) {
          setvideo(res.data);
          setLoadError(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to load videos:", error);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setloading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const retryFetch = () => {
    setloading(true);
    setLoadError(false);
    setRetryCount((count) => count + 1);
  };

  // const videos = [
  //   {
  //     _id: "1",
  //     videotitle: "Amazing Nature Documentary",
  //     filename: "nature-doc.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/nature-doc.mp4",
  //     filesize: "500MB",
  //     videochanel: "Nature Channel",
  //     Like: 1250,
  //     views: 45000,
  //     uploader: "nature_lover",
  //     createdAt: new Date().toISOString(),
  //   },
  //   {
  //     _id: "2",
  //     videotitle: "Cooking Tutorial: Perfect Pasta",
  //     filename: "pasta-tutorial.mp4",
  //     filetype: "video/mp4",
  //     filepath: "/videos/pasta-tutorial.mp4",
  //     filesize: "300MB",
  //     videochanel: "Chef's Kitchen",
  //     Like: 890,
  //     views: 23000,
  //     uploader: "chef_master",
  //     createdAt: new Date(Date.now() - 86400000).toISOString(),
  //   },
  // ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {loading ? (
        <>Loading..</>
      ) : loadError ? (
        <div className="col-span-full flex flex-col items-center gap-3 py-12 text-center">
          <p>Unable to load videos. Please try again.</p>
          <Button variant="outline" onClick={retryFetch}>
            Retry
          </Button>
        </div>
      ) : videos.length === 0 ? (
        <p className="col-span-full py-12 text-center text-gray-600">
          No videos available yet.
        </p>
      ) : (
        videos.map((video) => <Videocard key={video._id} video={video} />)
      )}
    </div>
  );
};

export default Videogrid;