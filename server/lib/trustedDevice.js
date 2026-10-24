import { createHmac, timingSafeEqual } from "node:crypto";
import { TrustedDevice } from "../Modals/loginSecurity.js";

const DEVICE_COOKIE = "yt_trusted_device";

export const hashSecurityValue = (value) => {
  const secret = process.env.AUTH_SECURITY_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECURITY_SECRET must contain at least 32 characters");
  }
  return createHmac("sha256", secret).update(value).digest("hex");
};

export const parseLoginDevice = (req) => {
  const agent = req.get("user-agent") || "";
  const browserMatch =
    agent.match(/Edg\/([\d.]+)/) ||
    agent.match(/Firefox\/([\d.]+)/) ||
    agent.match(/Chrome\/([\d.]+)/) ||
    agent.match(/Version\/([\d.]+).*Safari/);
  const browser = !browserMatch
    ? "Unknown"
    : /Edg\//.test(browserMatch[0])
      ? "Edge"
      : /Firefox\//.test(browserMatch[0])
        ? "Firefox"
        : /Chrome\//.test(browserMatch[0])
          ? "Chrome"
          : "Safari";
  const operatingSystem = /Windows NT/i.test(agent)
    ? "Windows"
    : /Android/i.test(agent)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(agent)
        ? "iOS"
        : /Mac OS X/i.test(agent)
          ? "macOS"
          : /Linux/i.test(agent)
            ? "Linux"
            : "Unknown";
  const deviceType = /iPad|Tablet/i.test(agent)
    ? "Tablet"
    : /Mobile|iPhone|Android/i.test(agent)
      ? "Mobile"
      : "Desktop";
  const deviceModel =
    agent.match(/(?:iPhone|iPad|Pixel [\w ]+|SM-[A-Z0-9]+)/i)?.[0] ||
    "Unknown";

  return {
    ipAddress: req.ip || req.socket.remoteAddress || "unknown",
    browser,
    browserVersion: browserMatch?.[1] || "",
    operatingSystem,
    deviceType,
    deviceModel,
    city: "Unavailable",
    state: "Unavailable",
    country: "Unavailable",
    approximateLocation: "Unavailable",
  };
};

export const getTrustedCookieToken = (req) => {
  const value = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_COOKIE}=`))
    ?.slice(DEVICE_COOKIE.length + 1);
  if (!value) return null;

  const [token, signature] = value.split(".");
  if (!token || !signature) return null;
  const expected = Buffer.from(hashSecurityValue(token));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return token;
};

export const findMatchingTrustedDevice = async (req, userId, currentCity) => {
  const token = getTrustedCookieToken(req);
  if (!token) return null;

  const device = parseLoginDevice(req);
  const trusted = await TrustedDevice.findOne({
    userId,
    tokenHash: hashSecurityValue(token),
    trustedUntil: { $gt: new Date() },
    revokedAt: null,
  });
  if (
    !trusted ||
    trusted.browser !== device.browser ||
    trusted.operatingSystem !== device.operatingSystem ||
    trusted.deviceType !== device.deviceType ||
    trusted.deviceModel !== device.deviceModel ||
    trusted.ipAddress !== device.ipAddress ||
    (currentCity && trusted.city !== currentCity)
  ) {
    return null;
  }
  return trusted;
};
