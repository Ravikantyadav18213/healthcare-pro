import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMessageSquare,
  FiUserCheck,
  FiCheck,
  FiX,
  FiSlash,
  FiCalendar,
  FiClock,
  FiMail,
} from "react-icons/fi";

import ConversationList from "../components/ConversationList.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import Modal, { ConfirmDialog } from "../components/ui/Modal.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";

import { useAuth } from "../hooks/useAuth.js";
import { useConversations, useConversationMessages } from "../hooks/useChat.js";
import chatService from "../services/chatService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";

const TABS = [
  {
    key: "conversations",
    labelKey: "adminChat.tabConversations",
    label: "Patient Conversations",
    icon: FiMessageSquare,
  },
  {
    key: "requests",
    labelKey: "adminChat.tabRequests",
    label: "Doctor Chat Requests",
    icon: FiUserCheck,
  },
];

const STATUS_FILTERS = ["pending", "approved", "rejected", "revoked", "all"];

/* The status enum is also what the badges read, so each value carries
   the key it should be rendered through. */
const STATUS_LABELS = {
  pending: ["adminChat.statusPending", "Pending"],
  approved: ["adminChat.statusApproved", "Approved"],
  rejected: ["adminChat.statusRejected", "Rejected"],
  revoked: ["adminChat.statusRevoked", "Revoked"],
  all: ["adminChat.statusAll", "All"],
};

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  revoked: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function statusLabel(t, status) {
  const found = STATUS_LABELS[status];
  return found ? t(found[0], found[1]) : status;
}

export default function AdminChatRequests() {
  const [tab, setTab] = useState("conversations");
  const t = useT();

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass shrink-0 px-4 py-2 flex items-center gap-4"
      >
        <h1 className="text-base sm:text-lg font-bold shrink-0">
          {t("adminChat.title", "Patient Communication")}
        </h1>

        {/* min-w-0 + flex-1: a flex item defaults to min-width:auto, which
            keeps it at its content width and stops overflow-x-auto from
            ever scrolling — the tabs just get pushed off-screen instead.
            flex-1 makes the tab strip (which already scrolls internally)
            absorb the squeeze instead of the title getting clipped. */}
        <div className="flex flex-1 gap-1 overflow-x-auto min-w-0 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]">
          {TABS.map(({ key, labelKey, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                tab === key
                  ? "bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Icon size={15} />
              {t(labelKey, label)}
            </button>
          ))}
        </div>
      </motion.div>

      {tab === "conversations" ? (
        <PatientConversations />
      ) : (
        /* The requests tab is an ordinary list, so it scrolls inside
           the column rather than taking over the viewport. */
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <DoctorRequests />
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   TAB 1 — PATIENT CONVERSATIONS
================================================================== */

function PatientConversations() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const { items, loading, error, refetch } = useConversations();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");

  const decorated = useMemo(
    () => items.map((item) => ({ ...item, viewerRole: "admin" })),
    [items]
  );

  /*
   * Both panes are on screen from lg up, so opening the first thread
   * there is helpful. Below lg they are alternate views of the same
   * space: auto-selecting would re-open a thread the moment the back
   * button cleared it, leaving no way back to the list.
   */
  const twoPane = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 1024px)").matches;

  useEffect(() => {
    if (!selectedId && decorated.length > 0 && twoPane()) {
      setSelectedId(decorated[0].id);
    }
  }, [decorated, selectedId]);

  const selected = decorated.find((c) => c.id === selectedId) || null;
  const {
    conversation,
    messages,
    loading: messagesLoading,
    sending,
    send,
    sendAttachment,
    loadOlder,
    loadingOlder,
    hasOlder,
    typingName,
    setTyping,
    firstUnreadId,
  } = useConversationMessages(selectedId);

  const activeConversation = conversation || selected;

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden flex-1 min-h-0">
      <div className="flex h-full">
        <div
          className={`w-full lg:w-80 border-r border-slate-100 dark:border-slate-800 shrink-0 ${
            selected ? "hidden lg:flex" : "flex"
          } flex-col`}
        >
          <ConversationList
            items={decorated}
            loading={loading}
            selectedId={selectedId}
            currentUserId={user?.id}
            onSelect={(c) => setSelectedId(c.id)}
            search={search}
            onSearchChange={setSearch}
            emptyTitle={t("adminChat.noConversations", "No patient conversations")}
            emptyDescription={t(
              "adminChat.noConversationsDesc",
              "Conversations appear here as soon as a patient opens a chat."
            )}
          />
        </div>

        <div className={`flex-1 min-h-0 ${selected ? "flex" : "hidden lg:flex"}`}>
          <ChatWindow
            conversation={activeConversation}
            messages={messages}
            loading={messagesLoading}
            sending={sending}
            currentUserId={user?.id}
            viewerRole="admin"
            onSend={async (text) => {
              try {
                await send(text);
              } catch (caught) {
                toast.error(caught?.message || "Could not send that message.");
                throw caught;
              }
            }}
            onSendAttachment={async (file, options) => {
              try {
                await sendAttachment(file, options);
              } catch (caught) {
                toast.error(caught?.message || "Could not send that attachment.");
                throw caught;
              }
            }}
            onLoadOlder={loadOlder}
            loadingOlder={loadingOlder}
            hasOlder={hasOlder}
            typingName={typingName}
            onTyping={setTyping}
            firstUnreadId={firstUnreadId}
            onBack={() => setSelectedId(null)}
          />
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   TAB 2 — DOCTOR CHAT REQUESTS
================================================================== */

function DoctorRequests() {
  const toast = useToast();
  const t = useT();

  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await chatService.listDoctorRequests(status);
      setItems(data.items);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async () => {
    if (!approveTarget) return;
    setWorking(true);
    try {
      await chatService.approveDoctorRequest(approveTarget.id);
      toast.success(`Approved chat between ${approveTarget.patientName} and ${approveTarget.doctorName}.`);
      setApproveTarget(null);
      load();
    } catch (caught) {
      toast.error(caught?.message || "Could not approve this request.");
    } finally {
      setWorking(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setWorking(true);
    try {
      await chatService.rejectDoctorRequest(rejectTarget.id, rejectReason.trim() || undefined);
      toast.success("Request rejected.");
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (caught) {
      toast.error(caught?.message || "Could not reject this request.");
    } finally {
      setWorking(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setWorking(true);
    try {
      await chatService.revokeDoctorRequest(revokeTarget.id);
      toast.success("Doctor communication revoked.");
      setRevokeTarget(null);
      load();
    } catch (caught) {
      toast.error(caught?.message || "Could not revoke this request.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={`badge capitalize transition ${
              status === key
                ? "bg-brand-600 text-white"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            }`}
          >
            {statusLabel(t, key)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={22} className="text-brand-500" />
        </div>
      ) : error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiUserCheck}
            title={t("adminChat.noRequests", "No pending doctor chat requests.")}
            description={t(
              "adminChat.noRequestsDesc",
              "Patient requests to contact a doctor will appear here for review."
            )}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence initial={false}>
            {items.map((request) => (
              <motion.article
                key={request.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="glass-card space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      {request.patientName}
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <FiMail size={11} />
                      {request.patientEmail}
                    </p>
                  </div>
                  <span className={`badge shrink-0 capitalize ${STATUS_BADGE[request.status]}`}>
                    {statusLabel(t, request.status)}
                  </span>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    Dr. {request.doctorName?.replace(/^Dr\.?\s*/i, "")}
                  </p>
                  <p className="text-xs text-slate-400">{request.doctorSpecialization}</p>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">{t("adminChat.reason", "Reason")}: </span>
                  {request.reason}
                </p>

                {request.rejectionReason && (
                  <p className="text-xs text-red-500">
                    {t("adminChat.rejectionNote", "Rejection note")}: "{request.rejectionReason}"
                  </p>
                )}

                <div className="flex items-center gap-4 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <FiClock size={11} />
                    {t("adminChat.requested", "Requested")} {formatDate(request.requestedAt)}
                  </span>
                  {request.appointmentId && (
                    <span className="inline-flex items-center gap-1">
                      <FiCalendar size={11} />
                      {t("adminChat.appt", "Appt")} #{request.appointmentId}
                    </span>
                  )}
                </div>

                {request.status === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setApproveTarget(request)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 transition"
                    >
                      <FiCheck size={13} />
                      {t("adminChat.approve", "Approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(request)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    >
                      <FiX size={13} />
                      {t("adminChat.reject", "Reject")}
                    </button>
                  </div>
                )}

                {request.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => setRevokeTarget(request)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                  >
                    <FiSlash size={13} />
                    {t("adminChat.revokeAccess", "Revoke Access")}
                  </button>
                )}
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ---------- approve modal ---------- */}
      <Modal
        open={Boolean(approveTarget)}
        onClose={() => !working && setApproveTarget(null)}
        title={t("adminChat.approveTitle", "Approve Doctor Chat")}
        size="sm"
      >
        {approveTarget && (
          <div className="space-y-3 text-sm">
            <Row label={t("label.patient", "Patient")} value={approveTarget.patientName} />
            <Row
              label={t("label.doctor", "Doctor")}
              value={`Dr. ${approveTarget.doctorName?.replace(/^Dr\.?\s*/i, "")}`}
            />
            <Row label={t("adminChat.reason", "Reason")} value={approveTarget.reason} />
            <Row
              label={t("adminChat.requested", "Requested")}
              value={formatDate(approveTarget.requestedAt)}
            />

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={() => setApproveTarget(null)}
                disabled={working}
                className="btn-secondary flex-1 disabled:opacity-60"
              >
                {t("action.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={approve}
                disabled={working}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2 disabled:opacity-60"
              >
                {working && <Spinner size={14} />}
                {t("adminChat.approveChat", "Approve Chat")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- reject modal ---------- */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => {
          if (working) return;
          setRejectTarget(null);
          setRejectReason("");
        }}
        title={t("adminChat.rejectTitle", "Reject Doctor Chat Request")}
        size="sm"
      >
        {rejectTarget && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t("adminChat.rejectPrompt", "Reject the request from")}{" "}
              <strong>{rejectTarget.patientName}</strong>{" "}
              {t("adminChat.rejectPromptFor", "for")}{" "}
              <strong>{rejectTarget.doctorName}</strong>?
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder={t(
                "adminChat.rejectReasonPlaceholder",
                "Optional reason (shown to the patient)..."
              )}
              rows={3}
              className="input-field resize-none"
            />
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                disabled={working}
                className="btn-secondary flex-1 disabled:opacity-60"
              >
                {t("action.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={reject}
                disabled={working}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2 disabled:opacity-60"
              >
                {working && <Spinner size={14} />}
                {t("adminChat.reject", "Reject")}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- revoke confirm ---------- */}
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={revoke}
        loading={working}
        tone="danger"
        title={t("adminChat.revokeTitle", "Revoke doctor communication")}
        message={
          revokeTarget &&
          t(
            "adminChat.revokeMessage",
            "{patient} and Dr. {doctor} will immediately lose the ability to message each other."
          )
            .replace("{patient}", revokeTarget.patientName)
            .replace("{doctor}", revokeTarget.doctorName?.replace(/^Dr\.?\s*/i, ""))
        }
        confirmLabel={t("adminChat.revokeAccess", "Revoke Access")}
      />
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2">
      <span className="text-xs font-semibold text-slate-400 shrink-0">{label}</span>
      <span className="text-right text-slate-700 dark:text-slate-200">{value}</span>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
