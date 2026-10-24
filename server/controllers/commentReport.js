import mongoose from "mongoose";
import commentReport from "../Modals/commentreport.js";
import comment from "../Modals/comment.js";

const allowedReasons = [
  "spam",
  "harassment",
  "hate_speech",
  "inappropriate_content",
  "offensive_content",
  "misinformation",
  "dangerous_links",
  "other",
];

// Submit a report against a comment
export const reportComment = async (req, res) => {
  try {
    const { commentid, reason, details = "" } = req.body;
    const reporterid = req.authenticatedUser?._id;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(commentid) || !reporterid) {
      return res.status(400).json({
        message: "Invalid comment or user ID.",
      });
    }

    // Validate report reason
    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        message: "Please select a valid report reason.",
      });
    }

    // Validate optional explanation
    if (typeof details !== "string" || details.length > 500) {
      return res.status(400).json({
        message: "Report details cannot exceed 500 characters.",
      });
    }

    // Confirm the comment exists
    const existingComment = await comment.findById(commentid);

    if (!existingComment) {
      return res.status(404).json({
        message: "Comment not found.",
      });
    }

    // Prevent duplicate reports
    const existingReport = await commentReport.findOne({
      commentid,
      reporterid,
    });

    if (existingReport) {
      return res.status(409).json({
        message: "You have already reported this comment.",
      });
    }

    // Save the report for review
    const newReport = await commentReport.create({
      commentid,
      reporterid,
      reason,
      details: details.trim(),
    });

    return res.status(201).json({
      message: "Report submitted successfully for review.",
      report: newReport,
    });
  } catch (error) {
    // MongoDB unique-index protection against simultaneous duplicate reports
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already reported this comment.",
      });
    }

    console.error("Error reporting comment:", error);

    return res.status(500).json({
      message: "Something went wrong while submitting the report.",
    });
  }
};

const reportStatuses = new Set(["pending", "reviewed", "action_taken", "dismissed"]);

export const getCommentReports = async (req, res) => {
  try {
    const { status = "pending" } = req.query;
    if (status !== "all" && !reportStatuses.has(status)) {
      return res.status(400).json({ message: "Invalid report status" });
    }

    const filter = status === "all" ? {} : { status };
    const reports = await commentReport
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate({
        path: "commentid",
        select: "commentbody usercommented isDeleted createdAt",
      })
      .populate("reporterid", "username channelname")
      .populate("moderatedBy", "username channelname")
      .lean();

    return res.status(200).json(reports);
  } catch (error) {
    console.error("Comment moderation queue retrieval failed:", error);
    return res.status(500).json({ message: "Unable to load comment reports" });
  }
};

export const moderateCommentReport = async (req, res) => {
  const { reportId } = req.params;
  const { decision, note = "" } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    return res.status(400).json({ message: "Invalid report ID" });
  }
  if (!["reviewed", "dismissed", "remove"].includes(decision)) {
    return res.status(400).json({ message: "Choose a valid moderation action" });
  }
  if (typeof note !== "string" || note.length > 1000) {
    return res.status(400).json({ message: "Moderation notes cannot exceed 1000 characters" });
  }

  try {
    const report = await commentReport.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (!["pending", "reviewed"].includes(report.status)) {
      return res.status(409).json({ message: "This report has already been resolved" });
    }

    const moderatedAt = new Date();
    if (decision === "remove") {
      const deletedComment = await comment.findOneAndUpdate(
        { _id: report.commentid, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: moderatedAt } },
        { new: true },
      );
      if (!deletedComment) {
        const existingComment = await comment.findById(report.commentid).select("_id");
        if (!existingComment) {
          return res.status(404).json({ message: "The reported comment no longer exists" });
        }
      }
    }

    const updatedReport = await commentReport.findOneAndUpdate(
      { _id: reportId, status: { $in: ["pending", "reviewed"] } },
      {
        $set: {
          status:
            decision === "remove"
              ? "action_taken"
              : decision === "dismissed"
                ? "dismissed"
                : "reviewed",
          moderatedBy: req.authenticatedUser._id,
          moderationNote: note.trim(),
          moderatedAt,
        },
      },
      { new: true },
    );
    if (!updatedReport) {
      return res.status(409).json({ message: "This report was updated by another moderator" });
    }

    return res.status(200).json({
      message: "Moderation decision recorded",
      report: updatedReport,
    });
  } catch (error) {
    console.error("Comment moderation action failed:", error);
    return res.status(500).json({ message: "Unable to update this report" });
  }
};