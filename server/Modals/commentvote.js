
import mongoose from "mongoose";

const commentVoteSchema = new mongoose.Schema(
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
    vote: {
      type: String,
      enum: ["like", "dislike"],
      required: true,
    },
  },
  { timestamps: true }
);

// One vote per user per comment
commentVoteSchema.index(
  { commentid: 1, userid: 1 },
  { unique: true }
);

export default mongoose.model("commentvote", commentVoteSchema);
