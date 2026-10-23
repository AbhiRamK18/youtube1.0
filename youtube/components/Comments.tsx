"use client";
import React, { useEffect, useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";
interface Comment {
  _id: string;
  videoid: string;
  userid: string;
  commentbody: string;
  usercommented: string;
  commentedon: string;

  likes?: number;
  avatar?: string;
  image?: string;
  username?: string;
  location?: string;
  updatedAt?: string;
  editedAt?: string;
}
interface Reply {
  _id: string;
  commentid: string;
  userid: string;
  userreplied: string;
  replybody: string;
  createdAt?: string;
  username?: string;
  location?: string;
}
type LanguageCode = "en" | "te" | "hi" | "ta" | "kn" | "ml";

const languages: { code: LanguageCode; name: string }[] = [
  { code: "en", name: "English" },
  { code: "te", name: "Telugu" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "ml", name: "Malayalam" },
];

const renderMentions = (text: string, userIds: string[]) => {
  const knownUserIds = [...new Set(userIds.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((userId) => userId.replace(/^@/, ""));
  const knownIdPattern = knownUserIds
    .map((userId) => userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const mentionPattern = new RegExp(
    knownIdPattern
      ? `@(?:${knownIdPattern})(?![\\p{L}\\p{N}_])|@[\\p{L}\\p{N}_-]+`
      : `@[\\p{L}\\p{N}_-]+`,
    "giu"
  );
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(
      <span
        key={index}
        className="font-semibold text-blue-600 dark:text-blue-400"
      >
        {match[0]}
      </span>
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

const Comments = ({ videoId }: any) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<
    "relevant" | "newest" | "oldest" | "mostLiked"
  >("relevant");
  const [voteData, setVoteData] = useState<
    Record<
      string,
      {
        likes: number;
        dislikes: number;
        userVote: "like" | "dislike" | null;
      }
    >
  >({});
  const fetchedComments = [
    {
      _id: "1",
      videoid: videoId,
      userid: "1",
      commentbody: "Great video! Really enjoyed watching this.",
      usercommented: "John Doe",
      commentedon: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      _id: "2",
      videoid: videoId,
      userid: "2",
      commentbody: "Thanks for sharing this amazing content!",
      usercommented: "Jane Smith",
      commentedon: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const mentionUserIds = useMemo(
    () =>
      [
        user?.channelname,
        ...comments.flatMap((comment) => [
          comment.usercommented,
          comment.username,
        ]),
        ...Object.values(replies).flatMap((commentReplies) =>
          commentReplies.flatMap((reply) => [
            reply.userreplied,
            reply.username,
          ])
        ),
      ].filter((userId): userId is string => Boolean(userId)),
    [comments, replies, user?.channelname]
  );
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loadingReplies, setLoadingReplies] = useState<string | null>(null);
  // Comment reporting state
  type ReportReason =
    | "spam"
    | "harassment"
    | "hate_speech"
    | "inappropriate_content"
    | "misinformation"
    | "dangerous_links"
    | "other";

  const [reportingCommentId, setReportingCommentId] = useState<string | null>(
    null,
  );

  const [reportReason, setReportReason] = useState<ReportReason>("spam");

  const [reportDetails, setReportDetails] = useState("");

  const [reportMessages, setReportMessages] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("en");
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const [translatingCommentId, setTranslatingCommentId] = useState<
    string | null
  >(null);

  const [translationErrors, setTranslationErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    loadComments();
  }, [videoId, user?._id]);

  async function loadComments() {
    try {
      const res = await axiosInstance.get(`/comment/${videoId}`);
      setComments(res.data);
      const voteRes = await axiosInstance.get(`/comment/votes/${videoId}`, {
        params: user?._id ? { userid: user._id } : {},
      });

      setVoteData(voteRes.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  }

  const sortedComments = useMemo(() => {
    const result = [...comments];

    switch (sortBy) {
      case "newest":
        return result.sort(
          (a, b) =>
            new Date(b.commentedon).getTime() -
            new Date(a.commentedon).getTime(),
        );

      case "oldest":
        return result.sort(
          (a, b) =>
            new Date(a.commentedon).getTime() -
            new Date(b.commentedon).getTime(),
        );

      case "mostLiked":
        return result.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));

      case "relevant":
      default:
        // Until relevance scoring is implemented, show newest first.
        return result.sort(
          (a, b) =>
            new Date(b.commentedon).getTime() -
            new Date(a.commentedon).getTime(),
        );
    }
  }, [comments, sortBy]);

  if (loading) {
    return <div>Loading history...</div>;
  }
  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await axiosInstance.post("/comment/postcomment", {
        videoid: videoId,
        userid: user._id,
        commentbody: newComment,
        usercommented: user.channelname || user.name,
      });
      if (res.data.comment) {
        const newCommentObj: Comment = {
          _id: Date.now().toString(),
          videoid: videoId,
          userid: user._id,
          commentbody: newComment,
          usercommented: user.channelname || user.name || "Anonymous",
          commentedon: new Date().toISOString(),
        };
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId
              ? {
                  ...c,
                  commentbody: editText.trim(),
                  updatedAt: new Date().toISOString(),
                }
              : c,
          ),
        );
      }
      setNewComment("");
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (comment: Comment) => {
    setEditingCommentId(comment._id);
    setEditText(comment.commentbody);
  };

  const handleUpdateComment = async () => {
    if (!editText.trim()) return;
    try {
      const res = await axiosInstance.post(
        `/comment/editcomment/${editingCommentId}`,
        { commentbody: editText },
      );
      if (res.data) {
        setComments((prev) =>
          prev.map((c) =>
            c._id === editingCommentId
              ? {
                  ...c,
                  commentbody: editText,
                  updatedon: new Date().toISOString(),
                }
              : c,
          ),
        );
        setEditingCommentId(null);
        setEditText("");
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await axiosInstance.delete(`/comment/deletecomment/${id}`);
      if (res.data.comment) {
        setComments((prev) => prev.filter((c) => c._id !== id));
      }
    } catch (error) {
      console.log(error);
    }
  };

  const handleVote = async (commentId: string, vote: "like" | "dislike") => {
    if (!user) {
      alert("Please sign in to vote.");
      return;
    }

    try {
      const res = await axiosInstance.post(`/comment/vote/${commentId}`, {
        userid: user._id,
        vote,
      });

      setVoteData((prev) => ({
        ...prev,
        [commentId]: res.data,
      }));
    } catch (error) {
      console.error("Error voting on comment:", error);
    }
  };

  const loadReplies = async (commentId: string) => {
    setLoadingReplies(commentId);

    try {
      const res = await axiosInstance.get(`/comment/${commentId}/replies`);

      setReplies((prev) => ({
        ...prev,
        [commentId]: res.data,
      }));
    } catch (error) {
      console.error("Error loading replies:", error);
    } finally {
      setLoadingReplies(null);
    }
  };
  const handleSubmitReply = async (commentId: string) => {
    if (!user) {
      alert("Please sign in to reply.");
      return;
    }

    if (!replyText.trim()) return;

    try {
      const res = await axiosInstance.post(`/comment/${commentId}/replies`, {
        userid: user._id,
        userreplied: user.channelname || user.name || "Anonymous",
        replybody: replyText.trim(),
      });

      setReplies((prev) => ({
        ...prev,
        [commentId]: [...(prev[commentId] || []), res.data],
      }));

      setReplyText("");
      setReplyingTo(null);
    } catch (error) {
      console.error("Error submitting reply:", error);
    }
  };
  const handleDeleteReply = async (commentId: string, replyId: string) => {
    try {
      await axiosInstance.delete(`/comment/reply/${replyId}`);

      setReplies((prev) => ({
        ...prev,
        [commentId]: (prev[commentId] || []).filter(
          (reply) => reply._id !== replyId,
        ),
      }));
    } catch (error) {
      console.error("Error deleting reply:", error);
    }
  };

  // Submit a report for a comment
  const handleReportComment = async (commentId: string) => {
    if (!user?._id) {
      alert("Please sign in to report a comment.");
      return;
    }

    try {
      await axiosInstance.post("/comment/report", {
        commentid: commentId,
        reporterid: user._id,
        reason: reportReason,
        details: reportDetails.trim(),
      });

      setReportMessages((prev) => ({
        ...prev,
        [commentId]: {
          type: "success",
          message: "Report submitted successfully for review.",
        },
      }));

      setReportingCommentId(null);
      setReportDetails("");
      setReportReason("spam");
    } catch (error: any) {
      console.error("Error reporting comment:", error);

      const status = error?.response?.status;

      let message = "Unable to submit your report. Please try again.";

      if (status === 409) {
        message = "You have already reported this comment.";
      } else if (status === 400) {
        message =
          error?.response?.data?.message || "Invalid report information.";
      } else if (status === 404) {
        message = "This comment could not be found.";
      }

      setReportMessages((prev) => ({
        ...prev,
        [commentId]: {
          type: "error",
          message,
        },
      }));
    }
  };

  const handleTranslate = async (commentId: string, originalText: string) => {
    const text = originalText.trim();

    if (!text) return;

    if (sourceLanguage === targetLanguage) {
      setTranslationErrors((prev) => ({
        ...prev,
        [commentId]: "Choose two different languages.",
      }));
      return;
    }

    // Unique key prevents showing stale translations.
    const cacheKey = JSON.stringify([
      commentId,
      text,
      sourceLanguage,
      targetLanguage,
    ]);

    // Reuse a translation instead of calling the API again.
    if (translations[cacheKey]) {
      setTranslationErrors((prev) => ({
        ...prev,
        [commentId]: "",
      }));
      return;
    }

    setTranslatingCommentId(commentId);

    setTranslationErrors((prev) => ({
      ...prev,
      [commentId]: "",
    }));

    try {
      const res = await axiosInstance.post("/comment/translate", {
        text,
        sourceLang: sourceLanguage,
        targetLang: targetLanguage,
      });

      const translatedText = res.data.translatedText;

      if (typeof translatedText !== "string" || !translatedText.trim()) {
        throw new Error("The translation service returned no text.");
      }

      setTranslations((prev) => ({
        ...prev,
        [cacheKey]: translatedText,
      }));
    } catch (error: any) {
      console.error("Translation error:", error);

      const status = error?.response?.status;

      let message = "Translation failed. Please try again later.";

      if (status === 429) {
        message = "Translation limit reached. Please wait before trying again.";
      } else if (status === 502 || !error?.response) {
        message = "Translation service is unavailable. Please try again later.";
      }

      setTranslationErrors((prev) => ({
        ...prev,
        [commentId]: message,
      }));
    } finally {
      setTranslatingCommentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{comments.length} Comments</h2>

        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(
              e.target.value as "relevant" | "newest" | "oldest" | "mostLiked",
            )
          }
          aria-label="Sort comments"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="relevant">Relevant</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="mostLiked">Most liked</option>
        </select>
      </div>

      {user && (
        <div className="flex gap-4">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user.image || ""} />
            <AvatarFallback>{user.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e: any) => setNewComment(e.target.value)}
              className="min-h-[80px] resize-none border-0 border-b-2 rounded-none focus-visible:ring-0"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setNewComment("")}
                disabled={!newComment.trim()}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || isSubmitting}
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          sortedComments.map((comment) => (
            <div key={comment._id} className="flex gap-4">
              <Avatar className="w-10 h-10">
                <AvatarImage src={comment.avatar || comment.image || ""} />
                <AvatarFallback>{comment.usercommented[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {comment.usercommented}
                  </span>
                  <span className="text-xs text-gray-600">
                    {comment.commentedon &&
                    !Number.isNaN(new Date(comment.commentedon).getTime())
                      ? `${formatDistanceToNow(new Date(comment.commentedon))} ago`
                      : "Date unavailable"}
                  </span>
                  {comment.username && (
  <span className="text-xs text-blue-600 dark:text-blue-400">
    @{comment.username}
  </span>
)}

{comment.location && (
  <span className="text-xs text-gray-500">
    📍 {comment.location}
  </span>
)}

                  {(comment.updatedAt || comment.editedAt) && (
                    <span className="text-xs text-gray-500">(Edited)</span>
                  )}
                </div>

                {editingCommentId === comment._id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        onClick={handleUpdateComment}
                        disabled={!editText.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditText("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">
                      {renderMentions(comment.commentbody, mentionUserIds)}
                    </p>

                    {/* Translation controls */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={sourceLanguage}
                        onChange={(e) =>
                          setSourceLanguage(e.target.value as LanguageCode)
                        }
                        className="rounded-md border px-2 py-1 text-sm"
                        aria-label="Original comment language"
                      >
                        {languages.map((language) => (
                          <option key={language.code} value={language.code}>
                            From: {language.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={targetLanguage}
                        onChange={(e) =>
                          setTargetLanguage(e.target.value as LanguageCode)
                        }
                        className="rounded-md border px-2 py-1 text-sm"
                        aria-label="Choose translation language"
                      >
                        {languages.map((language) => (
                          <option key={language.code} value={language.code}>
                            {language.name}
                          </option>
                        ))}
                      </select>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          translatingCommentId === comment._id ||
                          sourceLanguage === targetLanguage
                        }
                        onClick={() =>
                          handleTranslate(comment._id, comment.commentbody)
                        }
                      >
                        {translatingCommentId === comment._id
                          ? "Translating..."
                          : "Translate"}
                      </Button>
                    </div>

                    {/* Show translated text */}
                    {translations[
                      JSON.stringify([
                        comment._id,
                        comment.commentbody.trim(),
                        sourceLanguage,
                        targetLanguage,
                      ])
                    ] && (
                      <div className="mt-2 rounded-md bg-muted p-3">
                        <p className="text-sm font-medium">
                          {
                            languages.find(
                              (language) => language.code === targetLanguage,
                            )?.name
                          }{" "}
                          translation
                        </p>

                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {
                            translations[
                              JSON.stringify([
                                comment._id,
                                comment.commentbody.trim(),
                                sourceLanguage,
                                targetLanguage,
                              ])
                            ]
                          }
                        </p>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const cacheKey = JSON.stringify([
                              comment._id,
                              comment.commentbody.trim(),
                              sourceLanguage,
                              targetLanguage,
                            ]);

                            setTranslations((prev) => {
                              const updated = { ...prev };
                              delete updated[cacheKey];
                              return updated;
                            });
                          }}
                        >
                          Hide translation
                        </Button>
                      </div>
                    )}

                    {/* Translation errors */}
                    {translationErrors[comment._id] && (
                      <p className="mt-2 text-sm text-red-500">
                        {translationErrors[comment._id]}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVote(comment._id, "like")}
                        className={
                          voteData[comment._id]?.userVote === "like"
                            ? "bg-gray-200"
                            : ""
                        }
                      >
                        👍 {voteData[comment._id]?.likes ?? 0}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVote(comment._id, "dislike")}
                        className={
                          voteData[comment._id]?.userVote === "dislike"
                            ? "bg-gray-200"
                            : ""
                        }
                      >
                        👎 {voteData[comment._id]?.dislikes ?? 0}
                      </Button>
                    </div>
                    {/* Reply button */}
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const isClosing = replyingTo === comment._id;

                          setReplyingTo(isClosing ? null : comment._id);
                          setReplyText("");

                          if (!isClosing && !replies[comment._id]) {
                            void loadReplies(comment._id);
                          }
                        }}
                      >
                        Reply ({replies[comment._id]?.length ?? 0})
                      </Button>
                    </div>

                    {/* Report button */}
                    {user && comment.userid !== user._id && (
                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReportingCommentId(
                              reportingCommentId === comment._id
                                ? null
                                : comment._id,
                            );

                            setReportDetails("");
                            setReportReason("spam");
                          }}
                        >
                          🚩 Report
                        </Button>
                      </div>
                    )}

                    {/* Report form */}
                    {reportingCommentId === comment._id && (
                      <div className="mt-3 space-y-3 rounded-lg border p-4">
                        <p className="text-sm font-semibold">
                          Report this comment
                        </p>

                        <label
                          className="block text-sm"
                          htmlFor={`report-reason-${comment._id}`}
                        >
                          Reason for reporting
                        </label>

                        <select
                          id={`report-reason-${comment._id}`}
                          value={reportReason}
                          onChange={(e) =>
                            setReportReason(e.target.value as ReportReason)
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="spam">
                            Spam or misleading content
                          </option>
                          <option value="harassment">
                            Harassment or bullying
                          </option>
                          <option value="hate_speech">Hate speech</option>
                          <option value="inappropriate_content">
                            Inappropriate content
                          </option>
                          <option value="misinformation">Misinformation</option>
                          <option value="dangerous_links">
                            Dangerous links
                          </option>
                          <option value="other">Other</option>
                        </select>

                        <label
                          className="block text-sm"
                          htmlFor={`report-details-${comment._id}`}
                        >
                          Additional details (optional)
                        </label>

                        <Textarea
                          id={`report-details-${comment._id}`}
                          placeholder="Explain why you are reporting this comment..."
                          value={reportDetails}
                          onChange={(e) => setReportDetails(e.target.value)}
                          maxLength={500}
                          rows={3}
                        />

                        <p className="text-xs text-gray-500">
                          {reportDetails.length}/500 characters
                        </p>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReportComment(comment._id)}
                          >
                            Submit Report
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReportingCommentId(null);
                              setReportDetails("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Report submission result */}
                    {reportMessages[comment._id] && (
                      <p
                        role="status"
                        className={`mt-2 text-sm ${
                          reportMessages[comment._id].type === "success"
                            ? "text-green-600"
                            : "text-red-500"
                        }`}
                      >
                        {reportMessages[comment._id].message}
                      </p>
                    )}

                    {/* Reply input */}
                    {replyingTo === comment._id && (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          placeholder="Write a reply..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={2}
                        />

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSubmitReply(comment._id)}
                            disabled={!replyText.trim()}
                          >
                            Reply
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyText("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Display nested replies */}
                    {loadingReplies === comment._id && (
                      <p className="ml-6 mt-2 text-sm text-gray-500">
                        Loading replies...
                      </p>
                    )}

                    <div className="ml-6 mt-2 space-y-3 border-l-2 pl-4">
                      {(replies[comment._id] || []).map((reply) => (
                        <div key={reply._id} className="text-sm">
                          <div className="flex items-center justify-between gap-2">
    <div className="flex flex-wrap items-center gap-2">
  <span className="font-semibold">
    {reply.userreplied || "Anonymous"}
  </span>

  {reply.username && (
    <span className="text-xs text-blue-600 dark:text-blue-400">
      @{reply.username}
    </span>
  )}

  {reply.location && (
    <span className="text-xs text-gray-500">
      📍 {reply.location}
    </span>
  )}
</div>

                            {user?._id === reply.userid && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleDeleteReply(comment._id, reply._id)
                                }
                              >
                                Delete
                              </Button>
                            )}
                          </div>

                          <p className="mt-1 whitespace-pre-wrap">
                            {renderMentions(reply.replybody, mentionUserIds)}
                          </p>

                          {reply.createdAt && (
                            <p className="mt-1 text-xs text-gray-500">
                              {formatDistanceToNow(new Date(reply.createdAt), {
                                addSuffix: true,
                              })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {comment.userid === user?._id && (
                      <div className="flex gap-2 mt-2 text-sm text-gray-500">
                        <button onClick={() => handleEdit(comment)}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(comment._id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Comments;
