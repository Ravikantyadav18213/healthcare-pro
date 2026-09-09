import React from "react";
import { motion } from "framer-motion";
import {
  FiShield,
  FiUserCheck,
  FiUser,
  FiSearch,
  FiImage,
  FiMic,
  FiFile,
} from "react-icons/fi";
import { IoCheckmark, IoCheckmarkDone } from "react-icons/io5";

import { EmptyState } from "./ui/States.jsx";

const STATUS_BADGE = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  locked: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  revoked: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  archived: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_LABEL = {
  active: "Active",
  pending: "Pending approval",
  locked: "Not approved",
  revoked: "Revoked",
  archived: "Archived",
};

/* SQLite stores UTC without a zone marker; normalise before parsing. */
function toDate(value) {
  if (!value) return null;
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Time for today, "Yesterday", then a date — as any inbox shows it. */
function listTime(value) {
  const date = toDate(value);
  if (!date) return "";

  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(new Date());
  const day = startOf(date);
  const oneDay = 24 * 60 * 60 * 1000;

  if (day === today) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  if (day === today - oneDay) return "Yesterday";

  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** How this conversation should be labelled for the person looking at the list. */
function describe(conversation, viewerRole) {
  if (conversation.type === "patient_admin") {
    return {
      name: viewerRole === "user" ? "HealthCare Pro Admin" : conversation.patientName || "Patient",
      sub: viewerRole === "user" ? "Support / Administrator" : conversation.patientEmail || "",
      icon: viewerRole === "user" ? FiShield : FiUser,
    };
  }

  if (viewerRole === "user") {
    return {
      name: conversation.doctorName ? `Dr. ${conversation.doctorName.replace(/^Dr\.?\s*/i, "")}` : "Doctor",
      sub: conversation.doctorSpecialization || "",
      icon: FiUserCheck,
    };
  }

  return {
    name: conversation.patientName || "Patient",
    sub: conversation.patientEmail || "",
    icon: FiUser,
  };
}

/* The icon that stands in front of a non-text preview. */
const PREVIEW_ICON = {
  image: FiImage,
  audio: FiMic,
  file: FiFile,
};

/**
 * The same delivery states as the message bubbles, drawn for a light
 * row: one tick when the other side is away, two once it reached
 * them, two in blue once they have read it.
 */
function RowTicks({ read, online }) {
  if (read) {
    return (
      <IoCheckmarkDone
        size={14}
        className="shrink-0 text-sky-500"
        aria-label="Read"
      />
    );
  }

  if (online) {
    return (
      <IoCheckmarkDone
        size={14}
        className="shrink-0 text-slate-400"
        aria-label="Delivered"
      />
    );
  }

  return (
    <IoCheckmark size={14} className="shrink-0 text-slate-400" aria-label="Sent" />
  );
}

export default function ConversationList({
  items,
  loading,
  selectedId,
  currentUserId,
  onSelect,
  search,
  onSearchChange,
  emptyTitle = "No conversations",
  emptyDescription,
}) {
  const filtered = search
    ? items.filter((item) => {
        const { name } = describe(item, item.viewerRole);
        const haystack = `${name} ${item.lastMessage || ""}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : items;

  return (
    <div className="flex flex-col h-full min-h-0">
      {onSearchChange && (
        <div className="relative px-3 pt-3 pb-2 shrink-0">
          <FiSearch
            className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"
            size={15}
          />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="input-field input-icon !py-2 text-sm"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex gap-3 p-3 animate-pulse">
              <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-2.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FiShield}
            title={emptyTitle}
            description={emptyDescription}
            compact
          />
        ) : (
          filtered.map((conversation, index) => {
            const { name, sub, icon: Icon } = describe(conversation, conversation.viewerRole);
            const active = Number(selectedId) === Number(conversation.id);

            const unread = conversation.unreadCount || 0;

            const lastIsMine =
              currentUserId != null &&
              conversation.lastMessageSenderId != null &&
              Number(conversation.lastMessageSenderId) === Number(currentUserId);

            const PreviewIcon = PREVIEW_ICON[conversation.lastMessageType];

            return (
              <motion.button
                key={conversation.id}
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.2) }}
                onClick={() => onSelect(conversation)}
                className={`w-full text-left flex gap-3 p-3 rounded-2xl transition ${
                  active
                    ? "bg-brand-50 dark:bg-brand-950/30 ring-1 ring-brand-200 dark:ring-brand-900"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white flex items-center justify-center">
                    <Icon size={17} />
                  </div>

                  {conversation.online && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">
                      {name}
                    </p>

                    {conversation.lastMessageAt && (
                      <span
                        className={`shrink-0 text-[10px] ${
                          unread
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        {listTime(conversation.lastMessageAt)}
                      </span>
                    )}
                  </div>

                  {sub && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{sub}</p>
                  )}

                  <div className="flex items-center gap-1.5 mt-1">
                    {/* Your own last message carries its delivery state,
                        the way it does in the thread. */}
                    {lastIsMine && (
                      <RowTicks
                        read={conversation.lastMessageRead}
                        online={conversation.online}
                      />
                    )}

                    {PreviewIcon && (
                      <PreviewIcon size={12} className="shrink-0 text-slate-400" />
                    )}

                    <p
                      className={`flex-1 text-xs truncate ${
                        unread
                          ? "font-semibold text-slate-700 dark:text-slate-200"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {conversation.lastMessage || "No messages yet."}
                    </p>

                    {unread > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </div>

                  <span
                    className={`badge mt-1.5 inline-block !text-[10px] !px-2 !py-0.5 ${
                      STATUS_BADGE[conversation.status] || STATUS_BADGE.archived
                    }`}
                  >
                    {STATUS_LABEL[conversation.status] || conversation.status}
                  </span>
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
