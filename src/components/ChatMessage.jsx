import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";
import {
  FiDownload,
  FiFile,
  FiPause,
  FiPlay,
  FiAlertCircle,
} from "react-icons/fi";

import chatService from "../services/chatService.js";
import { Spinner } from "./ui/States.jsx";

/* SQLite stores UTC without a zone marker; normalise before parsing. */
function formatTime(value) {
  if (!value) return "";
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "";
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Attachments live behind the authenticated API, so they are fetched
 * as a blob and held as an object URL for as long as the bubble is
 * mounted. The URL is revoked on unmount — a long thread of photos
 * would otherwise pin every one of them in memory.
 */
function useAttachment(message) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!message.attachmentUrl) return undefined;

    let objectUrl = null;
    let cancelled = false;

    chatService
      .fetchAttachment(message.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.attachmentUrl]);

  return { url, failed };
}

/* ---------------------------------------------------------------- */

function VoiceNote({ message, mine }) {
  const { url, failed } = useAttachment(message);
  const audioRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  /* The recorded length is stored, so the bubble can show a duration
     before the audio element has loaded any metadata of its own. */
  const total = message.attachmentDuration || 0;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  };

  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80">
        <FiAlertCircle size={14} />
        Voice message unavailable
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-[11rem]">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition disabled:opacity-60 ${
          mine
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-brand-500 text-white hover:bg-brand-600"
        }`}
      >
        {!url ? (
          <Spinner size={14} />
        ) : playing ? (
          <FiPause size={15} />
        ) : (
          <FiPlay size={15} className="translate-x-[1px]" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`h-1.5 rounded-full overflow-hidden ${
            mine ? "bg-white/25" : "bg-slate-200 dark:bg-slate-600"
          }`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-150 ${
              mine ? "bg-white" : "bg-brand-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className={`text-[10px] mt-1 ${mine ? "text-white/75" : "text-slate-400"}`}>
          {formatDuration(elapsed > 0 ? elapsed : total)}
        </p>
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setElapsed(0);
          }}
          onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
          className="hidden"
        />
      )}
    </div>
  );
}

function ImageAttachment({ message }) {
  const { url, failed } = useAttachment(message);

  if (failed) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80 py-2">
        <FiAlertCircle size={14} />
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return (
      <div className="w-48 h-32 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center">
        <Spinner size={18} />
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={message.attachmentName || "Shared image"}
        className="rounded-xl max-w-full max-h-64 object-cover"
      />
    </a>
  );
}

function FileAttachment({ message, mine }) {
  const { url, failed } = useAttachment(message);

  return (
    <a
      href={url || undefined}
      download={message.attachmentName || "attachment"}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 transition ${
        mine
          ? "bg-white/15 hover:bg-white/25"
          : "bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700"
      } ${url ? "" : "pointer-events-none opacity-70"}`}
    >
      <span
        className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
          mine ? "bg-white/20" : "bg-white dark:bg-slate-800"
        }`}
      >
        {failed ? (
          <FiAlertCircle size={16} />
        ) : url ? (
          <FiFile size={16} />
        ) : (
          <Spinner size={14} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold truncate">
          {message.attachmentName || "Attachment"}
        </span>
        <span className={`block text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
          {failed ? "Unavailable" : formatSize(message.attachmentSize)}
        </span>
      </span>

      {url && <FiDownload size={14} className="shrink-0" />}
    </a>
  );
}

/**
 * One tick means the message is stored but the other person is not
 * connected. Two ticks mean it reached them — they are online now, or
 * they have already read it, which is shown brighter.
 */
function DeliveryTicks({ read, recipientOnline }) {
  if (read) {
    return (
      <IoCheckmarkDone
        size={14}
        className="text-white"
        title="Read"
        aria-label="Read"
      />
    );
  }

  if (recipientOnline) {
    return (
      <IoCheckmarkDone
        size={14}
        className="opacity-70"
        title="Delivered"
        aria-label="Delivered"
      />
    );
  }

  return (
    <IoCheckmark size={14} className="opacity-70" title="Sent" aria-label="Sent" />
  );
}

/* ---------------------------------------------------------------- */

export default function ChatMessage({ message, mine, recipientOnline = false }) {
  const isVoice = message.messageType === "audio";
  const isImage = message.messageType === "image";
  const isFile = message.messageType === "file";
  const hasAttachment = isVoice || isImage || isFile;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${mine ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          mine
            ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-br-md"
            : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-bl-md"
        }`}
      >
        {!mine && message.senderName && (
          <p className="text-[11px] font-semibold text-brand-500 dark:text-brand-400 mb-0.5">
            {message.senderName}
          </p>
        )}

        {isVoice && <VoiceNote message={message} mine={mine} />}
        {isImage && <ImageAttachment message={message} />}
        {isFile && <FileAttachment message={message} mine={mine} />}

        {message.message && (
          <p className={`whitespace-pre-wrap break-words ${hasAttachment ? "mt-2" : ""}`}>
            {message.message}
          </p>
        )}

        <div
          className={`flex items-center gap-1 mt-1 text-[10px] ${
            mine ? "text-white/75 justify-end" : "text-slate-400 justify-end"
          }`}
        >
          <span>{formatTime(message.createdAt)}</span>
          {mine && (
            <DeliveryTicks
              read={message.isRead}
              recipientOnline={recipientOnline}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
