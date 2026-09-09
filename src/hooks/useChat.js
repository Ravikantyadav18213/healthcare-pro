import { useCallback, useEffect, useRef, useState } from "react";

import chatService from "../services/chatService.js";
import { useAuth } from "./useAuth.js";
import { useSocket } from "./useSocket.js";

/* Socket.IO carries live updates; this is only a safety net for a
   dropped connection, same pattern as the notification bell. */
const POLL_MS = 30000;

/**
 * The conversation list for whichever role is signed in (patient's
 * admin + doctor threads, a doctor's approved patients, or the
 * admin's patient inbox) — kept live over the socket with a polling
 * fallback.
 */
export function useConversations() {
  const { isAuthenticated } = useAuth();
  const { socket } = useSocket();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const data = await chatService.listConversations();
      if (mounted.current) {
        setItems(data.items);
        setError(null);
      }
    } catch (caught) {
      if (mounted.current) setError(caught);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      return undefined;
    }

    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!socket) return undefined;

    const onUpdate = () => load();

    /*
     * Presence changes far more often than anything else, and the
     * flag already rides along on each conversation — so patch it in
     * place rather than refetching the whole list on every connect
     * and disconnect.
     */
    const onPresence = ({ userId, online }) => {
      setItems((current) =>
        current.map((c) =>
          Number(c.doctorId) === Number(userId) ||
          Number(c.patientId) === Number(userId) ||
          c.type === "patient_admin"
            ? { ...c, online }
            : c
        )
      );
    };

    socket.on("chat:message", onUpdate);
    socket.on("chat:conversation-updated", onUpdate);
    socket.on("chat:read", onUpdate);
    socket.on("chat:request-updated", onUpdate);
    socket.on("chat:presence", onPresence);

    return () => {
      socket.off("chat:message", onUpdate);
      socket.off("chat:conversation-updated", onUpdate);
      socket.off("chat:read", onUpdate);
      socket.off("chat:request-updated", onUpdate);
      socket.off("chat:presence", onPresence);
    };
  }, [socket, load]);

  const totalUnread = items.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  return { items, loading, error, refetch: load, totalUnread };
}

/**
 * Messages for a single open conversation: history, live inbound
 * messages, and a `send` mutation. `send` calls the same REST
 * endpoint the backend gates on approval — a 403 here means the
 * server disagreed with whatever the UI was showing, and is
 * surfaced to the caller rather than swallowed.
 */
const PAGE_SIZE = 30;

export function useConversationMessages(conversationId) {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  /* Older history, fetched a page at a time on request. */
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);

  /* Who is typing on the other side right now. */
  const [typingName, setTypingName] = useState(null);
  const typingTimer = useRef(null);

  /*
   * Where the unread run started when the thread was opened. Kept in a
   * ref so marking messages read does not move the divider out from
   * under the person still reading them.
   */
  const [firstUnreadId, setFirstUnreadId] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    try {
      const data = await chatService.listMessages(conversationId, {
        limit: PAGE_SIZE,
      });
      if (!mounted.current) return;

      setConversation(data.conversation);
      setMessages(data.items);
      setTotal(data.total);
      setPage(1);

      /*
       * The server marks the thread read as it serves it, so the
       * divider has to be worked out from this response — a moment
       * later every message already says it was read.
       */
      const firstUnread = data.items.find(
        (m) => !m.isRead && Number(m.senderId) !== Number(user?.id)
      );
      setFirstUnreadId(firstUnread ? firstUnread.id : null);

      setError(null);
    } catch (caught) {
      if (mounted.current) setError(caught);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  /* Fetch one page further back and prepend it. */
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const next = page + 1;
      const data = await chatService.listMessages(conversationId, {
        limit: PAGE_SIZE,
        page: next,
      });
      if (!mounted.current) return;

      setMessages((current) => {
        const known = new Set(current.map((m) => m.id));
        const older = data.items.filter((m) => !known.has(m.id));
        return [...older, ...current];
      });

      setTotal(data.total);
      setPage(next);
    } finally {
      if (mounted.current) setLoadingOlder(false);
    }
  }, [conversationId, page, loadingOlder]);

  useEffect(() => {
    if (!socket || !conversationId) return undefined;

    const onMessage = (payload) => {
      if (Number(payload.conversationId) !== Number(conversationId)) return;

      setMessages((current) => {
        if (current.some((m) => m.id === payload.message.id)) return current;
        return [...current, payload.message];
      });

      /*
       * The thread is open and on screen, so anything arriving now has
       * been seen. Without this the sender is stuck on one tick and
       * the reader's badge keeps climbing until they navigate away and
       * back — listMessages only marks the thread read as it loads it.
       */
      const inbound = Number(payload.message.senderId) !== Number(user?.id);

      if (inbound && document.visibilityState === "visible") {
        chatService.markMessageRead(payload.message.id).catch(() => {
          /* The next open of the thread will mark it anyway. */
        });
      }

      /* Their message ends whatever they were typing. */
      if (inbound) setTypingName(null);
    };

    const onConversationUpdated = (updated) => {
      if (Number(updated.id) !== Number(conversationId)) return;
      setConversation(updated);
    };

    const onRead = (payload) => {
      if (Number(payload.conversationId) !== Number(conversationId)) return;
      setMessages((current) => current.map((m) => ({ ...m, isRead: true })));
    };

    const onTyping = (payload) => {
      if (Number(payload.conversationId) !== Number(conversationId)) return;
      if (Number(payload.userId) === Number(user?.id)) return;

      clearTimeout(typingTimer.current);

      if (!payload.typing) {
        setTypingName(null);
        return;
      }

      setTypingName(payload.name || "Typing");

      /* A dropped "stopped typing" must not leave the bubble stuck on. */
      typingTimer.current = setTimeout(() => setTypingName(null), 4000);
    };

    const onPresence = ({ userId, online }) => {
      setConversation((current) => {
        if (!current) return current;

        const involved =
          Number(current.doctorId) === Number(userId) ||
          Number(current.patientId) === Number(userId) ||
          current.type === "patient_admin";

        return involved ? { ...current, online } : current;
      });
    };

    socket.on("chat:message", onMessage);
    socket.on("chat:conversation-updated", onConversationUpdated);
    socket.on("chat:read", onRead);
    socket.on("chat:typing", onTyping);
    socket.on("chat:presence", onPresence);

    return () => {
      clearTimeout(typingTimer.current);
      socket.off("chat:message", onMessage);
      socket.off("chat:conversation-updated", onConversationUpdated);
      socket.off("chat:read", onRead);
      socket.off("chat:typing", onTyping);
      socket.off("chat:presence", onPresence);
    };
  }, [socket, conversationId, user?.id]);

  /*
   * Told to the other side, throttled: one ping when typing starts and
   * one when it stops, not one per keystroke.
   */
  const sentTypingAt = useRef(0);

  const setTyping = useCallback(
    (typing) => {
      if (!socket || !conversationId) return;

      const now = Date.now();
      if (typing && now - sentTypingAt.current < 2000) return;

      sentTypingAt.current = typing ? now : 0;
      socket.emit("chat:typing", { conversationId, typing });
    },
    [socket, conversationId]
  );

  const send = useCallback(
    async (message) => {
      setSending(true);

      /* Sending ends the typing state on the other side immediately. */
      setTyping(false);

      try {
        const response = await chatService.sendMessage(conversationId, message);
        const created = response.message;
        setMessages((current) =>
          current.some((m) => m.id === created.id) ? current : [...current, created]
        );
        return created;
      } finally {
        if (mounted.current) setSending(false);
      }
    },
    [conversationId, setTyping]
  );

  const sendAttachment = useCallback(
    async (file, options) => {
      setSending(true);
      try {
        const response = await chatService.sendAttachment(
          conversationId,
          file,
          options
        );
        const created = response.message;

        setMessages((current) =>
          current.some((m) => m.id === created.id) ? current : [...current, created]
        );

        return created;
      } finally {
        if (mounted.current) setSending(false);
      }
    },
    [conversationId]
  );

  return {
    conversation,
    messages,
    loading,
    error,
    sending,
    send,
    sendAttachment,
    refetch: load,
    loadOlder,
    loadingOlder,
    hasOlder: messages.length < total,
    typingName,
    setTyping,
    firstUnreadId,
  };
}

export default useConversations;
