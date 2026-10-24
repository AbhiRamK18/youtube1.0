
import mongoose from "mongoose";
import users from "../Modals/Auth.js";

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description, username, location } = req.body;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({
      message: "User unavailable...",
    });
  }

  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          channelname,
          description,
          username:
            username === undefined
              ? undefined
              : username.trim().replace(/^@/, "").toLowerCase(),
          location:
            location === undefined ? undefined : location.trim(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedata) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json(updatedata);
  } catch (error) {
    console.error("Profile update error:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const updateThemePreference = async (req, res) => {
  const { theme } = req.body || {};
  if (!["light", "dark"].includes(theme)) {
    return res.status(400).json({ message: "Theme must be light or dark" });
  }

  try {
    req.authenticatedUser.themePreference = theme;
    await req.authenticatedUser.save();
    return res.status(200).json({
      themePreference: req.authenticatedUser.themePreference,
    });
  } catch (error) {
    console.error("Theme preference update failed:", error);
    return res.status(500).json({ message: "Unable to save theme preference" });
  }
};
