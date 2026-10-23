
import mongoose from "mongoose";

const replySchema = new mongoose.Schema(
  {
    commentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    userreplied: {
      type: String,
      required: true,
    },
    replybody: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

export default mongoose.model("reply", replySchema);
