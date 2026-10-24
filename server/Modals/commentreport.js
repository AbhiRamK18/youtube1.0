import mongoose from "mongoose";

const commentReportSchema = new mongoose.Schema(
  {
    // The comment being reported
    commentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },

    // The user who submitted the report
    reporterid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    // Why the comment was reported
    reason: {
      type: String,
      required: true,
      enum: [
        "spam",
        "harassment",
        "hate_speech",
        "inappropriate_content",
        "offensive_content",
        "misinformation",
        "dangerous_links",
        "other",
      ],
    },

    // Optional explanation from the reporting user
    details: {
      type: String,
      maxlength: 500,
      default: "",
    },

    // Admin moderation status
    status: {
      type: String,
      enum: ["pending", "reviewed", "action_taken", "dismissed"],
      default: "pending",
    },

    // Admin moderation information
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },

    moderationNote: {
      type: String,
      maxlength: 1000,
      default: "",
    },

    moderatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate reports from the same user for the same comment.
commentReportSchema.index(
  { commentid: 1, reporterid: 1 },
  { unique: true }
);

export default mongoose.model("commentreport", commentReportSchema);