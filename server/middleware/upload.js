import crypto from "node:crypto";
import path from "node:path";
import multer from "multer";

import { config } from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { storeFile } from "../utils/storage.js";

/* ==================================================================
   REPORT FILE UPLOADS

   Only document and image formats a clinician would actually attach
   are accepted. Executables, archives and scripts are rejected on
   both extension and declared MIME type, and the stored filename is
   randomly generated so nothing user-supplied reaches storage.

   Files are held in memory only long enough to hand the buffer to
   storeFile() (Vercel Blob in production, local disk in dev) — never
   written to Multer's own disk storage, since a serverless function
   has no persistent filesystem to write to.
================================================================== */

const ALLOWED = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["text/plain", ".txt"],
  ["text/csv", ".csv"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".docx",
  ],
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".csv",
  ".docx",
]);

function fileFilter(_req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
    return cb(
      ApiError.badRequest(
        "Unsupported file type. Upload a PDF, image, DOCX, TXT or CSV file."
      )
    );
  }

  return cb(null, true);
}

const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

/** Single optional "file" field, with multer errors translated. */
export function uploadReportFile(req, res, next) {
  multerUpload.single("file")(req, res, async (error) => {
    if (error) return handleMulterError(error, config.maxUploadBytes, next);

    try {
      await persist(req.file, ALLOWED);
      next();
    } catch (err) {
      next(err);
    }
  });
}

/** Normalises an uploaded file into the shape reportService expects. */
export function describeUpload(file) {
  if (!file) return null;

  return {
    storedName: file.location,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

/* ==================================================================
   CHAT ATTACHMENTS

   A separate allow-list from reports: a chat carries the same
   documents and images, plus the audio formats a browser produces
   when recording a voice note. MediaRecorder picks its own container
   per browser (webm on Chrome/Firefox, mp4 on Safari), so every
   plausible output is accepted rather than one fixed type.
================================================================== */

const CHAT_ALLOWED = new Map([
  ...ALLOWED,
  ["audio/webm", ".webm"],
  ["audio/ogg", ".ogg"],
  ["audio/mp4", ".m4a"],
  ["audio/mpeg", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/x-wav", ".wav"],
  ["audio/aac", ".aac"],
]);

function chatFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || "").split(";")[0].trim();

  if (!CHAT_ALLOWED.has(mime)) {
    return cb(
      ApiError.badRequest(
        "Unsupported attachment. Send an image, PDF, DOCX, TXT, CSV or voice note."
      )
    );
  }

  return cb(null, true);
}

const chatMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter: chatFileFilter,
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
  },
});

/** Single required "file" field for a chat attachment. */
export function uploadChatAttachment(req, res, next) {
  chatMulter.single("file")(req, res, async (error) => {
    if (error) return handleMulterError(error, config.maxUploadBytes, next);

    try {
      await persist(req.file, CHAT_ALLOWED, "chat-");
      next();
    } catch (err) {
      next(err);
    }
  });
}

/** Which bubble the UI should render for this file. */
export function chatMessageTypeFor(mimeType) {
  const mime = String(mimeType || "").split(";")[0].trim();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/* ==================================================================
   SHARED HELPERS
================================================================== */

/** Uploads the parsed multer file to storage and stamps `file.location`. */
async function persist(file, allowList, prefix = "") {
  if (!file) return;

  /* A browser sends "audio/webm;codecs=opus" — the parameters are
     stripped before the extension is looked up. */
  const mime = String(file.mimetype || "").split(";")[0].trim();

  const extension =
    allowList.get(mime) ||
    path.extname(file.originalname).toLowerCase() ||
    ".bin";

  const storedName = `${prefix}${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;

  file.location = await storeFile(storedName, file.buffer, mime);
}

function handleMulterError(error, maxBytes, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return next(
        ApiError.badRequest(
          `File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`
        )
      );
    }
    return next(ApiError.badRequest(`Upload failed: ${error.message}`));
  }

  return next(error);
}
