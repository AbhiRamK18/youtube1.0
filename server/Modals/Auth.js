import mongoose from "mongoose";

const userschema = mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String },
  channelname: { type: String },
  description: { type: String },
  image: { type: String },

  // New fields for the commenting system
  username: {
    type: String,
    trim: true,
    lowercase: true,
  },
  location: {
    type: String,
    trim: true,
  },
  themePreference: {
    type: String,
    enum: ["light", "dark"],
  },

  joinedon: { type: Date, default: Date.now },
});

export default mongoose.model("user", userschema);