import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

import api from "../services/api.js";
import { useAuth } from "./useAuth.js";

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY;
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER;

/* Events the server ever triggers on a user's own private channel —
   bound once per connection and re-dispatched through the shim below
   under the exact same event name every consumer already listens for. */
const FORWARDED_EVENTS = [
  "chat:message",
  "chat:conversation-updated",
  "chat:read",
  "chat:request-updated",
  "chat:typing",
  "notification:new",
  "dashboard:stats-changed",
];

/**
 * A tiny event-emitter matching the socket.io-client interface
 * (`on`/`off`/`emit`) that every consumer (useChat, Notification,
 * Dashboard) was already written against — so moving the realtime
 * transport from socket.io to Pusher only meant rewriting this file,
 * not its callers.
 */
class RealtimeShim {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  dispatch(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  emit(event, payload) {
    /*
     * The only client-originated event this app sends. It can't be a
     * Pusher client event (those only reach OTHER subscribers of the
     * SAME channel, and each user only subscribes to their own private
     * channel) — so it goes over a plain authenticated POST instead,
     * relayed server-side to the other participant's channel exactly
     * like every other push in this app.
     */
    if (event === "chat:typing") {
      api
        .post(`/chat/conversations/${payload.conversationId}/typing`, {
          typing: payload.typing,
        })
        .catch(() => {
          /* A dropped typing ping is not worth retrying. */
        });
    }
  }
}

let sharedShim = null;
let sharedPusher = null;
let refCount = 0;

/**
 * One real Pusher connection shared by every component on the page
 * (chat badge, conversation list, open chat window), authorized
 * against the caller's own private channel via the same HttpOnly
 * cookie the REST API uses — no token ever touches component state.
 */
export function useSocket() {
  const { isAuthenticated, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const shimRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setConnected(false);
      return undefined;
    }

    if (!PUSHER_KEY || !PUSHER_CLUSTER) {
      /* Realtime not configured — the rest of the app (data fetching,
         actions) works fine, just without live push updates. */
      setConnected(false);
      return undefined;
    }

    if (!sharedPusher) {
      sharedShim = new RealtimeShim();

      sharedPusher = new Pusher(PUSHER_KEY, {
        cluster: PUSHER_CLUSTER,
        forceTLS: true,
        channelAuthorization: {
          transport: "ajax",
          customHandler: ({ socketId, channelName }, callback) => {
            api
              .post("/realtime/auth", {
                socket_id: socketId,
                channel_name: channelName,
              })
              .then((response) => callback(null, response.data))
              .catch((error) => callback(error, null));
          },
        },
      });

      const userChannel = sharedPusher.subscribe(`private-user-${user.id}`);
      const presenceChannel = sharedPusher.subscribe("presence-online");

      FORWARDED_EVENTS.forEach((event) => {
        userChannel.bind(event, (payload) => sharedShim.dispatch(event, payload));
      });

      /*
       * Pusher's presence channel broadcasts membership changes to
       * every subscriber automatically — no server round-trip needed
       * to know a conversation partner just came online or dropped.
       */
      presenceChannel.bind("pusher:member_added", (member) => {
        sharedShim.dispatch("chat:presence", { userId: Number(member.id), online: true });
      });
      presenceChannel.bind("pusher:member_removed", (member) => {
        sharedShim.dispatch("chat:presence", { userId: Number(member.id), online: false });
      });
    }

    refCount += 1;
    shimRef.current = sharedShim;
    setConnected(sharedPusher.connection.state === "connected");

    const onStateChange = (states) => setConnected(states.current === "connected");
    sharedPusher.connection.bind("state_change", onStateChange);

    return () => {
      sharedPusher?.connection.unbind("state_change", onStateChange);

      refCount -= 1;
      if (refCount <= 0) {
        sharedPusher?.disconnect();
        sharedPusher = null;
        sharedShim = null;
        refCount = 0;
      }
    };
  }, [isAuthenticated, user?.id]);

  return { socket: shimRef.current, connected };
}

export default useSocket;
