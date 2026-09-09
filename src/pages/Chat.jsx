import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FiPlus, FiShield } from "react-icons/fi";

import ConversationList from "../components/ConversationList.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import DoctorChatRequestModal from "../components/DoctorChatRequestModal.jsx";
import { ErrorState } from "../components/ui/States.jsx";

import { useAuth } from "../hooks/useAuth.js";
import { useConversations, useConversationMessages } from "../hooks/useChat.js";
import chatService from "../services/chatService.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";

/*
 * Patient "Messages": a Patient <-> Admin thread that always exists,
 * plus zero or more Patient <-> Doctor threads that stay locked until
 * an administrator approves them. The composer disables itself the
 * moment the conversation status is anything but "active" — the
 * server enforces the same rule independently on every send.
 */
export default function Chat() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const { items, loading, error, refetch } = useConversations();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [ensuring, setEnsuring] = useState(true);

  /* Every patient always has an admin thread; create it once on entry. */
  useEffect(() => {
    chatService
      .startAdminChat()
      .then(() => refetch())
      .catch(() => {})
      .finally(() => setEnsuring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decorated = useMemo(
    () => items.map((item) => ({ ...item, viewerRole: "user" })),
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
      const admin = decorated.find((c) => c.type === "patient_admin");
      setSelectedId(admin?.id ?? decorated[0].id);
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

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass shrink-0 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3"
      >
        <h1 className="text-base sm:text-lg font-bold truncate min-w-0">
          {t("chat.title", "Chat with Admin & Doctors")}
        </h1>

        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          className="btn-primary text-sm inline-flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <FiPlus size={15} />
          {t("chat.requestDoctorChat", "Request Doctor Chat")}
        </button>
      </motion.div>

      {error ? (
        <div className="glass-card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : (
        <div className="glass overflow-hidden flex-1 min-h-0">
          <div className="flex h-full">
            <div
              className={`w-full lg:w-80 border-r border-slate-100 dark:border-slate-800 shrink-0 ${
                selected ? "hidden lg:flex" : "flex"
              } flex-col`}
            >
              <ConversationList
                items={decorated}
                loading={loading || ensuring}
                selectedId={selectedId}
                currentUserId={user?.id}
                onSelect={(c) => setSelectedId(c.id)}
                search={search}
                onSearchChange={setSearch}
                emptyTitle={t("chat.empty.title", "No conversations yet")}
                emptyDescription={t(
                  "chat.empty.description",
                  "Choose a doctor to request secure communication, or wait for your admin thread to load."
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
                viewerRole="user"
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
      )}

      <DoctorChatRequestModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onRequested={() => {
          toast.success("Request sent. Waiting for admin approval.");
          refetch();
        }}
      />

      {!loading && decorated.filter((c) => c.type === "patient_doctor").length === 0 && (
        <div className="glass-card flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <FiShield className="text-brand-500 shrink-0" size={18} />
          {t("chat.secureHint", "Choose a doctor to request secure communication.")}
        </div>
      )}
    </div>
  );
}
