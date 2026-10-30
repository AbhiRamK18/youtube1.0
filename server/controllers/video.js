import video from "../Modals/video.js";
import mongoose from "mongoose";
import { unlink } from "node:fs/promises";

export const uploadvideo = async (req, res) => {
  if (req.file === undefined) {
    return res
      .status(400)
      .json({ message: "Please upload a valid video file." });
  } else {
    try {
      const { videotitle, videochanel, uploader } = req.body;
      if (
        !videotitle?.trim() ||
        !videochanel?.trim() ||
        String(uploader) !== String(req.authenticatedUser._id)
      ) {
        await unlink(req.file.path).catch((cleanupError) =>
          console.error("Unable to remove invalid uploaded video:", cleanupError),
        );
        return res.status(400).json({
          message: "Video title and the signed-in user's channel are required.",
        });
      }
      const premiumOnly = req.body.premiumOnly === "true";
      const requestedPlan = req.body.minimumPlan;
      if (
        premiumOnly &&
        !["bronze", "silver", "gold"].includes(requestedPlan)
      ) {
        await unlink(req.file.path).catch((cleanupError) =>
          console.error("Unable to remove invalid uploaded video:", cleanupError),
        );
        return res.status(400).json({ message: "Choose a valid minimum subscription plan." });
      }
      const file = new video({
        videotitle: videotitle.trim(),
        filename: req.file.originalname,
        filepath: `/uploads/${req.file.filename}`,
        filetype: req.file.mimetype,
        filesize: req.file.size,
        videochanel: videochanel.trim(),
        uploader: String(req.authenticatedUser._id),
        premiumOnly,
        minimumPlan: premiumOnly ? requestedPlan : "bronze",
      });
      await file.save();
      return res.status(201).json("file uploaded successfully");
    } catch (error) {
      console.error(" error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  }
};

export const updateVideoAccess = async (req, res) => {
  const { videoId } = req.params;
  const { premiumOnly, minimumPlan = "bronze" } = req.body || {};
  if (
    !mongoose.Types.ObjectId.isValid(videoId) ||
    typeof premiumOnly !== "boolean" ||
    (premiumOnly && !["bronze", "silver", "gold"].includes(minimumPlan))
  ) {
    return res.status(400).json({ message: "Invalid video access settings" });
  }

  try {
    const updated = await video.findOneAndUpdate(
      {
        _id: videoId,
        uploader: String(req.authenticatedUser._id),
      },
      {
        $set: {
          premiumOnly,
          minimumPlan: premiumOnly ? minimumPlan : "bronze",
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      const exists = await video.exists({ _id: videoId });
      return res.status(exists ? 403 : 404).json({
        message: exists ? "Only the uploader can change video access" : "Video not found",
      });
    }
    return res.status(200).json(updated);
  } catch (error) {
    console.error("Video access update failed:", error);
    return res.status(500).json({ message: "Unable to update video access" });
  }
};
export const getallvideo = async (req, res) => {
  try {
    const files = await video.find();
    return res.status(200).send(files);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};