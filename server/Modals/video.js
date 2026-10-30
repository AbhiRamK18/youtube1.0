import mongoose from "mongoose";
const videochema = mongoose.Schema(
  {
    videotitle: { type: String, required: true },
    filename: { type: String, required: true },
    filetype: { type: String, required: true },
    filename: { type: String, required: true },
    filepath: { type: String, required: true },
    filesize: { type: String, required: true },
    videochanel: { type: String, required: true },
    Like: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    uploader: { type: String },
    thumbnail: { type: String, default: "" },
    premiumOnly: { type: Boolean, default: false },
    minimumPlan: {
      type: String,
      enum: ["bronze", "silver", "gold"],
      default: "bronze",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("videofiles", videochema);