
import mongoose from "mongoose";
import users from "../Modals/Auth.js";

export const login = async (req, res) => {
  const { email, name, image } = req.body;

  try {
    const existingUser = await users.findOne({ email });

    if (!existingUser) {
      const newUser = await users.create({
        email,
        name,
        image,
      });

      return res.status(201).json({ result: newUser });
    } else {
      // Refresh Google profile details without overwriting
      // the user's custom username or location.
      existingUser.name = name || existingUser.name;
      existingUser.image = image || existingUser.image;

      await existingUser.save();

      return res.status(200).json({ result: existingUser });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

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
