import assert from "node:assert/strict";
import { test } from "node:test";
import { TrustedDevice } from "../Modals/loginSecurity.js";
import {
  buildTrustedDeviceCookie,
  findMatchingTrustedDevice,
  hashSecurityValue,
} from "./trustedDevice.js";

test("HTTPS deployments issue trusted-device cookies for cross-site API requests", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSameSite = process.env.AUTH_COOKIE_SAMESITE;
  const previousFrontendUrl = process.env.FRONTEND_URL;
  const previousSecret = process.env.AUTH_SECURITY_SECRET;
  process.env.NODE_ENV = "development";
  process.env.AUTH_COOKIE_SAMESITE = "Lax";
  process.env.FRONTEND_URL = "https://youtube.vercel.app";
  process.env.AUTH_SECURITY_SECRET = "test-secret-with-at-least-32-characters";

  try {
    const cookie = buildTrustedDeviceCookie(
      "test-device-token",
      new Date("2030-01-01T00:00:00.000Z"),
    );
    assert.match(cookie, /;\s*SameSite=None;/);
    assert.match(cookie, /;\s*Secure$/);
    assert.match(cookie, /;\s*HttpOnly;/);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousSameSite === undefined) {
      delete process.env.AUTH_COOKIE_SAMESITE;
    } else {
      process.env.AUTH_COOKIE_SAMESITE = previousSameSite;
    }
    if (previousFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = previousFrontendUrl;
    }
    if (previousSecret === undefined) {
      delete process.env.AUTH_SECURITY_SECRET;
    } else {
      process.env.AUTH_SECURITY_SECRET = previousSecret;
    }
  }
});

test("trusted devices remain valid when the user's IP address changes", async () => {
  const previousSecret = process.env.AUTH_SECURITY_SECRET;
  const previousFindOne = TrustedDevice.findOne;
  process.env.AUTH_SECURITY_SECRET = "test-secret-with-at-least-32-characters";

  const token = "test-device-token";
  const trustedDevice = {
    browser: "Chrome",
    operatingSystem: "Windows",
    deviceType: "Desktop",
    deviceModel: "Unknown",
    ipAddress: "198.51.100.10",
    city: "Unavailable",
    state: "Unavailable",
  };
  TrustedDevice.findOne = async () => trustedDevice;

  const req = {
    headers: {
      cookie: `yt_trusted_device=${token}.${hashSecurityValue(token)}`,
    },
    ip: "203.0.113.20",
    get: (name) =>
      name.toLowerCase() === "user-agent"
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
        : "",
  };

  try {
    assert.equal(
      await findMatchingTrustedDevice(req, "user-id"),
      trustedDevice,
    );

    req.get = (name) =>
      name.toLowerCase() === "user-agent"
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0"
        : "";
    assert.equal(await findMatchingTrustedDevice(req, "user-id"), null);
  } finally {
    TrustedDevice.findOne = previousFindOne;
    if (previousSecret === undefined) {
      delete process.env.AUTH_SECURITY_SECRET;
    } else {
      process.env.AUTH_SECURITY_SECRET = previousSecret;
    }
  }
});
