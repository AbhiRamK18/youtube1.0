export type Video = {
  _id: string;
  videotitle: string;
  filepath: string;
  videochanel: string;
  views: number;
  createdAt: string;
  uploader?: string;
  premiumOnly?: boolean;
  minimumPlan?: "bronze" | "silver" | "gold";
};

export type PlaylistItem = {
  _id: string;
  videoid: Video;
  createdAt: string;
};

export type ChannelProfile = {
  _id?: string;
  channelname?: string;
  description?: string;
};
