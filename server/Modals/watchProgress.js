import mongoose from "mongoose";

const watchProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
      index: true,
    },
    position: { type: Number, required: true, min: 0 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

watchProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

export default mongoose.model("watchprogress", watchProgressSchema);
