import comment from "../Modals/comment.js";
import mongoose from "mongoose";
import commentVote from "../Modals/commentvote.js";
import reply from "../Modals/reply.js";
import { filterCommentText } from "../middleware/commentFilter.js";

export const postcomment = async (req, res) => {
  const commentdata = req.body;
  const { commentbody, userid, videoid } = req.body;

  // Step 1: Validate the comment text
  const validation = filterCommentText(commentbody);

  if (!validation.valid) {
    return res.status(400).json({
      message: validation.message,
    });
  }

  // Step 2: Check for duplicate comments within 60 seconds
  try {
    const cutoffTime = new Date(Date.now() - 60 * 1000);

    const recentComments = await comment.find({
      userid: userid,
      videoid: videoid,
      createdAt: { $gte: cutoffTime },
    }).select("commentbody");

    const normalizedNewComment = validation.text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const isDuplicate = recentComments.some((existingComment) => {
      const normalizedExistingComment = existingComment.commentbody
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      return normalizedExistingComment === normalizedNewComment;
    });

    if (isDuplicate) {
      return res.status(409).json({
        message: "You already posted this comment recently. Please wait before posting it again.",
      });
    }

    // Step 3: Save the comment
    commentdata.commentbody = validation.text;

    const newComment = new comment(commentdata);
    await newComment.save();

    return res.status(200).json({ comment: true });

  } catch (error) {
    console.error("Error posting comment:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const getallcomment = async (req, res) => {
  const { videoid } = req.params;

  if (!mongoose.Types.ObjectId.isValid(videoid)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }

  try {
    const commentvideo = await comment
      .find({ videoid })
      .populate("userid", "name channelname username image avatar location")
      .sort({ createdAt: -1 });

    const formattedComments = commentvideo.map((item) => {
      const data = item.toObject();
      const author =
        data.userid && typeof data.userid === "object"
          ? data.userid
          : null;

      return {
        ...data,

        // Keep the existing frontend field as a string.
        userid: author?._id?.toString() ?? data.userid?.toString(),

        // Prefer the author's current channel name, with saved names as fallback.
        usercommented:
          author?.channelname ||
          data.usercommented ||
          author?.name ||
          author?.username ||
          "Anonymous",
          username: author?.username || "",

        // Additional fields used by the frontend.
        userimage: author?.image || author?.avatar || "",
        avatar: author?.avatar || author?.image || "",
        location: author?.location || "",

        // Mongoose timestamps provide the persistent edit time.
        updatedAt: data.updatedAt,
      };
    });

    return res.status(200).json(formattedComments);
  } catch (error) {
    console.error("Error retrieving comments:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const deletecomment = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid comment ID" });
  }

  try {
    const deletedComment = await comment.findByIdAndDelete(id);

    if (!deletedComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Delete all replies belonging to this comment
    await reply.deleteMany({ commentid: id });

    return res.status(200).json({
      message: "Comment and replies deleted successfully",
      comment: deletedComment,
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};


export const editcomment = async (req, res) => {
  const { id } = req.params;
  const { commentbody } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid comment ID" });
  }

  if (typeof commentbody !== "string" || !commentbody.trim()) {
    return res.status(400).json({
      message: "Comment cannot be empty",
    });
  }

  if (commentbody.length > 2000) {
    return res.status(400).json({
      message: "Comment cannot exceed 2000 characters",
    });
  }

  try {
    const updatedComment = await comment.findByIdAndUpdate(
      id,
      {
        $set: {
          commentbody: commentbody.trim(),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedComment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error("Error editing comment:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};


export const voteComment = async (req, res) => {
  const { commentid } = req.params;
  const { userid, vote } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(commentid) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({ message: "Invalid comment or user ID" });
  }

  if (!["like", "dislike"].includes(vote)) {
    return res.status(400).json({ message: "Invalid vote type" });
  }

  try {
    const existingVote = await commentVote.findOne({
      commentid,
      userid,
    });

    if (existingVote && existingVote.vote === vote) {
      // Clicking the same vote again removes it
      await commentVote.findByIdAndDelete(existingVote._id);
    } else if (existingVote) {
      // Change an existing like to dislike, or vice versa
      existingVote.vote = vote;
      await existingVote.save();
    } else {
      // Create a new vote
      await commentVote.create({ commentid, userid, vote });
    }

    const votes = await commentVote.find({ commentid });

    return res.status(200).json({
      likes: votes.filter((item) => item.vote === "like").length,
      dislikes: votes.filter((item) => item.vote === "dislike").length,
      userVote:
        (await commentVote.findOne({ commentid, userid }))?.vote || null,
    });
  } catch (error) {
    console.error("Comment voting error:", error);
    return res.status(500).json({ message: "Unable to save vote" });
  }
};

export const getCommentVotes = async (req, res) => {
  const { videoid } = req.params;
  const { userid } = req.query;

  if (!mongoose.Types.ObjectId.isValid(videoid)) {
    return res.status(400).json({ message: "Invalid video ID" });
  }

  if (userid && !mongoose.Types.ObjectId.isValid(userid)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const comments = await mongoose
      .model("comment")
      .find({ videoid })
      .select("_id");

    const commentIds = comments.map((item) => item._id);

    const allVotes = await commentVote.find({
      commentid: { $in: commentIds },
    });

    const result = {};

    for (const id of commentIds) {
      const commentVotes = allVotes.filter(
        (item) => item.commentid.toString() === id.toString()
      );

      result[id.toString()] = {
        likes: commentVotes.filter((item) => item.vote === "like").length,
        dislikes: commentVotes.filter((item) => item.vote === "dislike").length,
        userVote: userid
          ? commentVotes.find((item) => item.userid.toString() === userid)?.vote || null
          : null,
      };
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Getting comment votes error:", error);
    return res.status(500).json({ message: "Unable to load votes" });
  }
};

export const addReply = async (req, res) => {
  const { commentid } = req.params;
  const { userid, userreplied, replybody } = req.body;
  const validation = filterCommentText(replybody);

if (!validation.valid) {
  return res.status(400).json({
    message: validation.message,
  });
}

  if (
    !mongoose.Types.ObjectId.isValid(commentid) ||
    !mongoose.Types.ObjectId.isValid(userid)
  ) {
    return res.status(400).json({ message: "Invalid comment or user ID" });
  }

  if (!replybody || !replybody.trim()) {
    return res.status(400).json({ message: "Reply cannot be empty" });
  }

  try {
    const originalComment = await mongoose
      .model("comment")
      .findById(commentid);

    if (!originalComment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const newReply = await reply.create({
      commentid,
      userid,
      userreplied: userreplied || "Anonymous",
      replybody: validation.text,
      
    });

    return res.status(201).json(newReply);
  } catch (error) {
    console.error("Add reply error:", error);
    return res.status(500).json({ message: "Unable to add reply" });
  }
};

export const getReplies = async (req, res) => {
  const { commentid } = req.params;

  if (!mongoose.Types.ObjectId.isValid(commentid)) {
    return res.status(400).json({ message: "Invalid comment ID" });
  }

  try {
const replies = await reply
  .find({ commentid })
  .populate("userid", "name channelname username image avatar location")
  .sort({ createdAt: 1 });

const formattedReplies = replies.map((item) => {
  const data = item.toObject();

  const author =
    data.userid && typeof data.userid === "object"
      ? data.userid
      : null;

  return {
    ...data,
    userid: author?._id?.toString() ?? data.userid?.toString(),
    username: author?.username || "",
    userreplied:
      author?.channelname ||
      data.userreplied ||
      author?.name ||
      author?.username ||
      "Anonymous",
    userimage: author?.image || author?.avatar || "",
    location: author?.location || "",
  };
});

return res.status(200).json(formattedReplies);
  } catch (error) {
    console.error("Get replies error:", error);
    return res.status(500).json({ message: "Unable to load replies" });
  }
};

export const deleteReply = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid reply ID" });
  }

  try {
    const deletedReply = await reply.findByIdAndDelete(id);

    if (!deletedReply) {
      return res.status(404).json({ message: "Reply not found" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete reply error:", error);
    return res.status(500).json({ message: "Unable to delete reply" });
  }
};

export const translateComment = async (req, res) => {
  const { text, sourceLang = "en", targetLang } = req.body;

  const supportedLanguages = ["en", "te", "hi", "ta", "kn", "ml"];

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({
      message: "Text is required",
    });
  }

  if (text.length > 2000) {
    return res.status(400).json({
      message: "Text must be 2000 characters or fewer",
    });
  }

  if (
    !supportedLanguages.includes(sourceLang) ||
    !supportedLanguages.includes(targetLang) ||
    sourceLang === targetLang
  ) {
    return res.status(400).json({
      message: "Invalid source or target language",
    });
  }

  try {
    const params = new URLSearchParams({
      q: text.trim(),
      langpair: `${sourceLang}|${targetLang}`,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;

    try {
      response = await fetch(
        `https://api.mymemory.translated.net/get?${params.toString()}`,
        {
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("MyMemory HTTP status:", response.status);

      if (response.status === 429) {
        return res.status(429).json({
          message: "Translation quota reached. Please try later.",
        });
      }

      return res.status(502).json({
        message: "Translation service is temporarily unavailable",
      });
    }

    const data = await response.json();

    if (data.responseStatus === 429) {
      return res.status(429).json({
        message: "Translation quota reached. Please try later.",
      });
    }

    if (
      data.responseStatus !== 200 ||
      typeof data.responseData?.translatedText !== "string" ||
      !data.responseData.translatedText.trim()
    ) {
      console.error("MyMemory response:", data.responseDetails);

      return res.status(502).json({
        message: "Unable to translate this text",
      });
    }

    return res.status(200).json({
      originalText: text,
      translatedText: data.responseData.translatedText,
      sourceLang,
      targetLang,
    });
  } catch (error) {
    console.error("Translation service error:", error);

    return res.status(502).json({
      message: "Translation service timed out or could not be reached",
    });
  }
};
