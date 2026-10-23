import mongoose from "mongoose";
import commentReport from "../Modals/commentreport.js";
import comment from "../Modals/comment.js";

const allowedReasons = [
  "spam",
  "harassment",
  "hate_speech",
  "inappropriate_content",
  "misinformation",
  "dangerous_links",
  "other",
];

// Submit a report against a comment
export const reportComment = async (req, res) => {
  try {
    const { commentid, reporterid, reason, details = "" } = req.body;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(commentid) ||
      !mongoose.Types.ObjectId.isValid(reporterid)
    ) {
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