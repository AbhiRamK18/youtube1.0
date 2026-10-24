import mongoose from "mongoose";
import video from "../Modals/video.js";
import watchProgress from "../Modals/watchProgress.js";

export const getWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }

  try {
    const progress = await watchProgress
      .findOne({ userId: req.authenticatedUser._id, videoId })
      .select("position completed completedAt updatedAt");
    return res.status(200).json({ progress });
  } catch (error) {
    console.error("Watch progress retrieval failed:", error);
    return res.status(500).json({ message: "Unable to load watch progress" });
  }
};

export const saveWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  const { position, completed = false } = req.body || {};
  if (
    !mongoose.Types.ObjectId.isValid(videoId) ||
    typeof position !== "number" ||
    !Number.isFinite(position) ||
    position < 0 ||
    position > 7 * 24 * 60 * 60 ||
    typeof completed !== "boolean"
  ) {
    return res.status(400).json({ message: "Invalid watch progress" });
  }

  try {
    const videoExists = await video.exists({ _id: videoId });
    if (!videoExists) return res.status(404).json({ message: "Video not found" });

    const now = new Date();
    const update = {
      $set: { position },
      $setOnInsert: {
        userId: req.authenticatedUser._id,
        videoId,
      },
    };
    if (completed) {
      update.$set.completed = true;
      update.$set.completedAt = now;
    } else {
      update.$setOnInsert.completed = false;
      update.$setOnInsert.completedAt = null;
    }

    const filter = { userId: req.authenticatedUser._id, videoId };
    let progress;
    try {
      progress = await watchProgress.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: false,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      progress = await watchProgress.findOneAndUpdate(
        filter,
        { $set: update.$set },
        { new: true, runValidators: true },
      );
      if (!progress) throw error;
    }

    return res.status(200).json({ progress });
  } catch (error) {
    console.error("Watch progress save failed:", error);
    return res.status(500).json({ message: "Unable to save watch progress" });
  }
};
