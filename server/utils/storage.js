import fs from "node:fs";
import path from "node:path";

import { config } from "../config/env.js";

/* ==================================================================
   FILE STORAGE

   Vercel serverless functions have no persistent/shared disk, so
   uploaded reports and chat attachments live in Vercel Blob in
   production. Locally, with no BLOB_READ_WRITE_TOKEN set, files fall
   back to local disk under config.uploadDir — same as before this
   migration, so `npm run dev:full` still needs no cloud account.

   Whatever `storeFile` returns is exactly what gets saved in the
   `reports.file_path` / `chat_messages.attachment_url` columns, and
   `readFile`/`deleteFile` dispatch on its shape (a full https:// URL
   means Blob, anything else is a bare filename under uploadDir) —
   so a row written before Blob was configured keeps working after,
   and vice versa.
================================================================== */

const blobEnabled = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

if (!blobEnabled) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

/** Saves a buffer under `storedName`, returning the value to persist. */
export async function storeFile(storedName, buffer, contentType) {
  if (blobEnabled) {
    const { put } = await import("@vercel/blob");
    const blob = await put(storedName, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return blob.url;
  }

  const absolute = path.join(config.uploadDir, storedName);
  await fs.promises.writeFile(absolute, buffer);
  return storedName;
}

/**
 * Reads a previously stored file back.
 * Returns `null` if it no longer exists, or a rejected/invalid stored
 * value tries to escape the local upload directory.
 */
export async function readFile(stored) {
  if (!stored) return null;

  if (isUrl(stored)) {
    const response = await fetch(stored);
    if (!response.ok) return null;

    return {
      stream: response.body,
      contentLength: response.headers.get("content-length") || null,
    };
  }

  const base = path.resolve(config.uploadDir);
  const absolute = path.resolve(base, stored);

  /* Guard against a stored value trying to escape the upload dir. */
  if (absolute !== base && !absolute.startsWith(base + path.sep)) return null;
  if (!fs.existsSync(absolute)) return null;

  return {
    stream: fs.createReadStream(absolute),
    contentLength: fs.statSync(absolute).size,
  };
}

/** Best-effort delete — never throws, mirrors the old fire-and-forget unlink. */
export async function deleteFile(stored) {
  if (!stored) return;

  try {
    if (isUrl(stored)) {
      const { del } = await import("@vercel/blob");
      await del(stored);
      return;
    }

    const base = path.resolve(config.uploadDir);
    const absolute = path.resolve(base, stored);
    if (absolute !== base && !absolute.startsWith(base + path.sep)) return;

    await fs.promises.unlink(absolute);
  } catch {
    /* already gone, or never existed — nothing to clean up */
  }
}
