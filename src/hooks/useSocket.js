import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

import { API_URL } from "../services/api.js";
import { useAuth } from "./useAuth.js";

/* The socket server is attached to the same HTTP server as the REST
   API, so it lives at the API origin minus the /api path prefix. */
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

let sharedSocket = null;
let refCount = 0;

/**
 * One real Socket.IO connection shared by every component on the page
 * (chat badge, conversation list, open chat window) — authenticated
 * with the same HttpOnly cookie the REST API uses, so no token ever
 * touches component state or localStorage.
 */
export function useSocket() {
  const { isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      return undefined;
    }

    if (!sharedSocket) {
      sharedSocket = io(SOCKET_URL, {
        withCredentials: true,
        transports: ["websocket", "polling"],
      });
    }

    refCount += 1;
    socketRef.current = sharedSocket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    sharedSocket.on("connect", onConnect);
    sharedSocket.on("disconnect", onDisconnect);
    setConnected(sharedSocket.connected);

    if (!sharedSocket.connected) sharedSocket.connect();

    return () => {
      sharedSocket?.off("connect", onConnect);
      sharedSocket?.off("disconnect", onDisconnect);

      refCount -= 1;
      if (refCount <= 0) {
        sharedSocket?.disconnect();
        sharedSocket = null;
        refCount = 0;
      }
    };
  }, [isAuthenticated]);

  return { socket: socketRef.current, connected };
}

export default useSocket;
