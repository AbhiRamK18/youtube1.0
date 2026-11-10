"use client";
import React, { useState } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";


const ChannelHeader = ({
  channel,
  user,
}: {
  channel: import("@/lib/types").ChannelProfile | null;
  user: import("@/lib/types").ChannelProfile | null;
}) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  return (
    <div className="w-full">
      {/* Banner */}
      <div className="relative h-32 md:h-48 lg:h-64 bg-gradient-to-r from-blue-400 to-purple-500 overflow-hidden"></div>

      {/* Channel Info */}
      <div className="px-3 py-5 sm:px-4 sm:py-6">
        <div className="flex min-w-0 flex-col items-start gap-4 sm:gap-6 md:flex-row">
          <Avatar className="w-20 h-20 md:w-32 md:h-32">
            <AvatarFallback className="text-2xl">
              {channel?.channelname?.[0] || "C"}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <h1 className="break-words text-2xl font-bold sm:text-3xl md:text-4xl">{channel?.channelname}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span className="break-all">@{channel?.channelname?.toLowerCase().replace(/\s+/g, "")}</span>
            </div>
            {channel?.description && (
              <p className="text-sm text-gray-700 max-w-2xl">
                {channel?.description}
              </p>
            )}
          </div>

          {user && user?._id !== channel?._id && (
            <div className="flex w-full gap-2 md:w-auto">
              <Button
                onClick={() => setIsSubscribed(!isSubscribed)}
                variant={isSubscribed ? "outline" : "default"}
                className={`w-full sm:w-auto ${
                  isSubscribed ? "bg-gray-100" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelHeader;