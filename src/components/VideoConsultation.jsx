import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiVideo, FiVideoOff, FiExternalLink, FiX, FiAlertCircle } from "react-icons/fi";

import { videoService } from "../services/clinicalService.js";
import { useToast } from "../context/ToastContext.jsx";
import { Alert, Spinner } from "./ui/States.jsx";

/* ==================================================================
   VIDEO CONSULTATION (Jitsi Meet)

   The call is embedded rather than opened in a new tab so the patient
   never loses the appointment context. Jitsi's external_api script is
   loaded on demand — pulling it in on every page load would cost
   every visitor a script they will almost never use.

   The room name comes from the server, which also decides whether
   this viewer is allowed in at all.
================================================================== */

const SCRIPT_ID = "jitsi-external-api";

/**
 * Load Jitsi's embed API once and reuse it.
 *
 * The promise is cached on window because two components mounting at
 * the same time would otherwise each append their own <script>.
 */
function loadJitsi(domain) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);

  if (window.__jitsiLoading) return window.__jitsiLoading;

  window.__jitsiLoading = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const script = existing || document.createElement("script");

    script.id = SCRIPT_ID;
    script.src = `https://${domain}/external_api.js`;
    script.async = true;

    script.onload = () =>
      window.JitsiMeetExternalAPI
        ? resolve(window.JitsiMeetExternalAPI)
        : reject(new Error("Jitsi loaded but exposed no API."));

    script.onerror = () =>
      reject(new Error("Could not reach the video service. Check your connection."));

    if (!existing) document.body.appendChild(script);
  });

  return window.__jitsiLoading;
}

export default function VideoConsultation({ appointmentId, onClose }) {
  const toast = useToast();

  const containerRef = useRef(null);
  const apiRef = useRef(null);

  const [call, setCall] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await videoService.join(appointmentId);
        if (cancelled) return;

        setCall(data.call);

        const JitsiMeetExternalAPI = await loadJitsi(data.call.domain);
        if (cancelled || !containerRef.current) return;

        apiRef.current = new JitsiMeetExternalAPI(data.call.domain, {
          roomName: data.call.room,
          parentNode: containerRef.current,
          userInfo: { displayName: data.call.displayName || "Participant" },
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
          },
        });

        apiRef.current.addEventListener("videoConferenceLeft", () => {
          onClose?.();
        });

        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        setError(caught.message || "Could not start the video consultation.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;

      /* Dispose explicitly: an orphaned Jitsi iframe keeps the camera
         and microphone open after the modal is gone. */
      try {
        apiRef.current?.dispose();
      } catch {
        /* already disposed */
      }
      apiRef.current = null;
    };
  }, [appointmentId, onClose]);

  /* Rendered via a portal to document.body: a fixed-position element
     nested inside any ancestor with backdrop-filter (e.g. .glass-card)
     gets a new containing block per spec and is boxed into that
     ancestor instead of the viewport — a portal sidesteps that
     regardless of where the button lives in the tree. */
  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-900/90 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 text-white shrink-0">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate flex items-center gap-2">
            <FiVideo size={15} className="shrink-0" />
            Video consultation
          </p>
          {call && (
            <p className="text-xs text-slate-400 truncate">
              {call.doctorName} · {call.date} {call.time}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {call && (
            <a
              href={call.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition inline-flex items-center gap-1.5"
            >
              <FiExternalLink size={12} />
              New tab
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Leave call"
            className="w-9 h-9 rounded-lg bg-red-600 hover:bg-red-700 transition flex items-center justify-center"
          >
            <FiX size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Spinner size={22} />
            <p className="text-sm text-slate-300">Connecting to the consultation room...</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm w-full bg-white dark:bg-slate-900 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <FiAlertCircle size={18} />
                <h3 className="font-semibold">Cannot start the call</h3>
              </div>

              <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>

              {call?.joinUrl && (
                <a
                  href={call.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm mt-4 inline-flex items-center gap-2"
                >
                  <FiExternalLink size={14} />
                  Open in a new tab instead
                </a>
              )}

              <button type="button" onClick={onClose} className="btn-primary text-sm mt-3 w-full">
                Close
              </button>
            </div>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>,
    document.body
  );
}

/**
 * The button that opens the call.
 *
 * Staff can also switch an appointment to video from here; patients
 * only ever get a Join button, and only once the hospital has made
 * the appointment a video one.
 */
export function VideoCallButton({ appointment, canManage = false, onChanged, className = "" }) {
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isVideo = appointment.mode === "video";

  const switchMode = async () => {
    setSwitching(true);

    try {
      await videoService.setMode(appointment.id, isVideo ? "in_person" : "video");
      toast.success(isVideo ? "Switched to an in-person visit." : "Switched to a video consultation.");
      onChanged?.();
    } catch (caught) {
      toast.error(caught.message || "Could not change the appointment mode.");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {isVideo && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-primary text-xs inline-flex items-center gap-1.5"
          >
            <FiVideo size={13} />
            Join video call
          </button>
        )}

        {canManage && (
          <button
            type="button"
            onClick={switchMode}
            disabled={switching}
            className="btn-secondary text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {switching ? (
              <Spinner size={12} />
            ) : isVideo ? (
              <FiVideoOff size={13} />
            ) : (
              <FiVideo size={13} />
            )}
            {isVideo ? "Make in-person" : "Make video call"}
          </button>
        )}
      </div>

      {open && (
        <VideoConsultation appointmentId={appointment.id} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
