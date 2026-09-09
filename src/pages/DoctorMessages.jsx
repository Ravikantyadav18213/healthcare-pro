import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

import ConversationList from "../components/ConversationList.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import { ErrorState } from "../components/ui/States.jsx";

import { useAuth } from "../hooks/useAuth.js";
import { useConversations, useConversationMessages } from "../hooks/useChat.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";

/*
 * Doctor "Patient Messages": only conversations an administrator has
 * actually approved ever appear here — a pending request never shows
 * up as if it were live, and the composer is still gated server-side
 * regardless of what this list renders.
 */
export default function DoctorMessages() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const { items, loading, error, refetch } = useConversations();
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");

  const decorated = useMemo(
    () => items.map((item) => ({ ...item, viewerRole: "doctor" })),
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

  return (
    <div className="h-full flex flex-col gap-2.5 min-h-0">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass shrink-0 px-4 py-2.5"
      >
        <h1 className="text-base sm:text-lg font-bold truncate">
          {t("doctorMessages.title", "Patient Messages")}
        </h1>
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
                loading={loading}
                selectedId={selectedId}
                currentUserId={user?.id}
                onSelect={(c) => setSelectedId(c.id)}
                search={search}
                onSearchChange={setSearch}
                emptyTitle={t(
                  "doctorMessages.emptyTitle",
                  "No approved patient conversations yet"
                )}
                emptyDescription={t(
                  "doctorMessages.emptyDesc",
                  "Once the administrator approves a patient's request, it will appear here."
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
                viewerRole="doctor"
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
    </div>
  );
}
