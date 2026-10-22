"use strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
const uploadDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "uploads"
);
mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, res, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      new Date().toISOString().replace(/:/g, "-") + "-" + file.originalname
    );
  },
});
const filefilter = (req, file, cb) => {
  if (file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};
const upload = multer({ storage: storage, fileFilter: filefilter });
export default upload;