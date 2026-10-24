export const requireAdminUser = (req, res, next) => {
  const configuredAdminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!configuredAdminEmails.length) {
    return res.status(503).json({
      message: "Admin moderation is not configured. Set ADMIN_EMAILS on the server.",
    });
  }

  const email = req.authenticatedUser?.email?.trim().toLowerCase();
  if (!email || !configuredAdminEmails.includes(email)) {
    return res.status(403).json({ message: "Admin access is required" });
  }

  return next();
};
