import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiSend,
  FiArrowLeft,
  FiShield,
  FiUserCheck,
  FiUser,
  FiLock,
  FiClock,
  FiSlash,
  FiPaperclip,
  FiMic,
  FiTrash2,
  FiChevronUp,
} from "react-icons/fi";

import ChatMessage from "./ChatMessage.jsx";
import { Spinner } from "./ui/States.jsx";
import { useVoiceRecorder, isRecordingSupported } from "../hooks/useVoiceRecorder.js";
import { useDictation } from "../hooks/useDictation.js";

const LOCK_MESSAGE = {
  pending: "Admin approval is required before you can chat with this doctor.",
  locked: "Your request was not approved by the administrator.",
  revoked: "Doctor communication has been disabled by the administrator.",
  archived: "This conversation has been archived.",
};

const LOCK_ICON = {
  pending: FiClock,
  locked: FiSlash,
  revoked: FiLock,
  archived: FiLock,
};

/* SQLite stores UTC without a zone marker; normalise before parsing. */
function toDate(value) {
  if (!value) return null;
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Today" / "Yesterday" / "24 Aug 2026" for a day separator. */
function dayLabel(value) {
  const date = toDate(value);
  if (!date) return "";

  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const today = startOf(new Date());
  const day = startOf(date);
  const oneDay = 24 * 60 * 60 * 1000;

  if (day === today) return "Today";
  if (day === today - oneDay) return "Yesterday";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function formatClock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Messages with a day separator inserted wherever the date changes,
 * and an unread marker at the first message the viewer had not seen.
 */
function withSeparators(messages, firstUnreadId) {
  const rows = [];
  let lastDay = null;

  for (const message of messages) {
    const day = dayLabel(message.createdAt);

    if (day && day !== lastDay) {
      rows.push({ kind: "day", key: `day-${message.id}`, label: day });
      lastDay = day;
    }

    if (firstUnreadId && message.id === firstUnreadId) {
      rows.push({ kind: "unread", key: `unread-${message.id}` });
    }

    rows.push({ kind: "message", key: `m-${message.id}`, message });
  }

  return rows;
}

export default function ChatWindow({
  conversation,
  messages,
  loading,
  sending,
  currentUserId,
  viewerRole,
  onSend,
  onSendAttachment,
  onBack,
  onLoadOlder,
  loadingOlder = false,
  hasOlder = false,
  typingName = null,
  onTyping,
  firstUnreadId = null,
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const scrollerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const recorder = useVoiceRecorder();
  const dictation = useDictation((text) => setDraft(text));

  const rows = useMemo(
    () => withSeparators(messages, firstUnreadId),
    [messages, firstUnreadId]
  );

  /*
   * Stay pinned to the newest message — but not while older history is
   * being prepended, which would yank the reader away from what they
   * just asked to see.
   */
  useEffect(() => {
    if (loadingOlder) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, conversation?.id, typingName, loadingOlder]);

  useEffect(() => {
    setDraft("");
    setError("");
  }, [conversation?.id]);

  /* Grow the composer with the text, up to the CSS max height. */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 48), 160)}px`;
  }, [draft]);

  const canCompose = conversation?.status === "active";

  const handleDraftChange = (value) => {
    setDraft(value);
    onTyping?.(value.trim().length > 0);
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setError("");
    try {
      await onSend(text);
      setDraft("");
      if (dictation.listening) dictation.stop();
    } catch (caught) {
      setError(caught?.message || "Could not send that message.");
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !onSendAttachment) return;

    setError("");
    try {
      await onSendAttachment(file, { message: draft.trim() });
      setDraft("");
    } catch (caught) {
      setError(caught?.message || "Could not send that attachment.");
    }
  };

  const startRecording = async () => {
    setError("");
    await recorder.start();
  };

  const finishRecording = async () => {
    const result = await recorder.stop();
    if (!result) return;

    try {
      const extension = (result.blob.type.split("/")[1] || "webm").split(";")[0];
      const file = new File([result.blob], `voice-note.${extension}`, {
        type: result.blob.type,
      });

      await onSendAttachment(file, { duration: result.duration });
    } catch (caught) {
      setError(caught?.message || "Could not send that voice message.");
    }
  };

  const cancelRecording = () => recorder.stop({ cancel: true });

  if (!conversation) {
    return (
      <div className="flex-1 hidden lg:flex items-center justify-center text-center px-8">
        <div>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-500 flex items-center justify-center mb-4">
            <FiShield size={24} />
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">
            Select a conversation
          </p>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">
            Choose a thread on the left to view messages.
          </p>
        </div>
      </div>
    );
  }

  const HeaderIcon =
    conversation.type === "patient_admin"
      ? viewerRole === "user"
        ? FiShield
        : FiUser
      : viewerRole === "user"
      ? FiUserCheck
      : FiUser;

  const headerName =
    conversation.type === "patient_admin"
      ? viewerRole === "user"
        ? "HealthCare Pro Admin"
        : conversation.patientName || "Patient"
      : viewerRole === "user"
      ? conversation.doctorName
        ? `Dr. ${conversation.doctorName.replace(/^Dr\.?\s*/i, "")}`
        : "Doctor"
      : conversation.patientName || "Patient";

  const headerSub =
    conversation.type === "patient_admin"
      ? viewerRole === "user"
        ? "Support / Administrator"
        : conversation.patientEmail || ""
      : viewerRole === "user"
      ? conversation.doctorSpecialization || ""
      : conversation.patientEmail || "";

  const LockIcon = LOCK_ICON[conversation.status];
  const composerError = error || recorder.error || dictation.error;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ---------- header ---------- */}
      <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <FiArrowLeft size={18} />
          </button>
        )}

        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
            <HeaderIcon size={17} />
          </div>

          {conversation.online && (
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate text-slate-800 dark:text-slate-100">
            {headerName}
          </p>

          {typingName ? (
            <p className="text-[11px] text-brand-500 dark:text-brand-400 truncate">
              typing...
            </p>
          ) : conversation.online ? (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
              Online
            </p>
          ) : (
            headerSub && (
              <p className="text-[11px] text-slate-400 truncate">{headerSub}</p>
            )
          )}
        </div>
      </div>

      {/* ---------- messages ---------- */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={22} className="text-brand-500" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">No messages yet.</p>
        ) : (
          <>
            {hasOlder && (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={loadingOlder}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 rounded-full px-3 py-1.5 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition disabled:opacity-60"
                >
                  {loadingOlder ? <Spinner size={12} /> : <FiChevronUp size={14} />}
                  {loadingOlder ? "Loading..." : "Load earlier messages"}
                </button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {rows.map((row) => {
                if (row.kind === "day") {
                  return (
                    <div key={row.key} className="flex justify-center py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
                        {row.label}
                      </span>
                    </div>
                  );
                }

                if (row.kind === "unread") {
                  return (
                    <div key={row.key} className="flex items-center gap-3 py-1">
                      <span className="flex-1 h-px bg-brand-200 dark:bg-brand-900" />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">
                        New messages
                      </span>
                      <span className="flex-1 h-px bg-brand-200 dark:bg-brand-900" />
                    </div>
                  );
                }

                return (
                  <ChatMessage
                    key={row.key}
                    message={row.message}
                    mine={Number(row.message.senderId) === Number(currentUserId)}
                    recipientOnline={Boolean(conversation.online)}
                  />
                );
              })}
            </AnimatePresence>
          </>
        )}

        {typingName && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 px-4 py-3 shadow-sm">
              <span className="flex items-center gap-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: `${dot * 0.15}s` }}
                  />
                ))}
              </span>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ---------- composer ---------- */}
      <div className="border-t border-slate-100 dark:border-slate-800 p-3 sm:p-4 shrink-0">
        {!canCompose ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-400"
          >
            {LockIcon && <LockIcon size={16} className="shrink-0" />}
            {LOCK_MESSAGE[conversation.status] || "This conversation is not available."}
          </motion.div>
        ) : recorder.recording ? (
          /* ---- recording bar, in place of the normal composer ---- */
          <div className="flex items-center gap-3 rounded-xl bg-red-50 dark:bg-red-950/20 px-3 py-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />

            <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {formatClock(recorder.seconds)}
            </span>

            <span className="flex-1 text-xs text-slate-500 dark:text-slate-400 truncate">
              Recording voice message...
            </span>

            <button
              type="button"
              onClick={cancelRecording}
              title="Discard recording"
              aria-label="Discard recording"
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              <FiTrash2 size={16} />
            </button>

            <button
              type="button"
              onClick={finishRecording}
              disabled={sending}
              title="Send voice message"
              aria-label="Send voice message"
              className="btn-primary shrink-0 w-10 h-10 !p-0 flex items-center justify-center disabled:opacity-50"
            >
              {sending ? <Spinner size={16} /> : <FiSend size={16} />}
            </button>
          </div>
        ) : (
          <>
            {composerError && (
              <p className="text-xs text-red-500 mb-2 px-1">{composerError}</p>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFile}
                accept="image/*,application/pdf,.docx,.txt,.csv"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach a file"
                aria-label="Attach a file"
                className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                <FiPaperclip size={19} />
              </button>

              <div className="relative flex-1 min-w-0">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  onBlur={() => onTyping?.(false)}
                  rows={1}
                  placeholder={
                    dictation.listening ? "Listening..." : "Type your message..."
                  }
                  aria-label="Type your message"
                  className={`input-field resize-none min-h-[3rem] max-h-40 py-3 text-[0.9375rem] leading-6 ${
                    dictation.supported ? "pr-12" : ""
                  }`}
                />

                {dictation.supported && (
                  <button
                    type="button"
                    onClick={dictation.listening ? dictation.stop : dictation.start}
                    title={dictation.listening ? "Stop dictation" : "Speak to type"}
                    aria-label={dictation.listening ? "Stop dictation" : "Speak to type"}
                    aria-pressed={dictation.listening}
                    className={`absolute right-1.5 bottom-1.5 w-9 h-9 rounded-lg flex items-center justify-center transition ${
                      dictation.listening
                        ? "bg-red-50 dark:bg-red-950/30 text-red-500 animate-pulse"
                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    <FiMic size={18} />
                  </button>
                )}
              </div>

              {draft.trim() || !isRecordingSupported() ? (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                  className="btn-primary shrink-0 w-12 h-12 !p-0 flex items-center justify-center disabled:opacity-50"
                >
                  {sending ? <Spinner size={18} /> : <FiSend size={18} />}
                </button>
              ) : (
                /* Empty draft: the send button becomes record, as it
                   does in every messaging app people already use. */
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={sending}
                  title="Record a voice message"
                  aria-label="Record a voice message"
                  className="btn-primary shrink-0 w-12 h-12 !p-0 flex items-center justify-center disabled:opacity-50"
                >
                  <FiMic size={19} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
