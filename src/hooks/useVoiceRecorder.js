import { useCallback, useEffect, useRef, useState } from "react";

/* ==================================================================
   VOICE NOTES

   MediaRecorder, wrapped so a component only deals with start / stop /
   cancel and a running duration.

   Each browser produces its own container — Chrome and Firefox give
   webm/opus, Safari gives mp4/aac — so the type is negotiated at
   record time rather than assumed, and the server's allow-list
   accepts all of them.
================================================================== */

const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;

  for (const type of CANDIDATE_TYPES) {
    if (!type) return "";
    if (MediaRecorder.isTypeSupported(type)) return type;
  }

  return "";
}

export const isRecordingSupported = () =>
  typeof window !== "undefined" &&
  typeof MediaRecorder !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);

  /* The microphone must be released even if the component unmounts
     mid-recording — otherwise the browser keeps showing the tab as
     recording after the page has moved on. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearInterval(timerRef.current);
      try {
        if (recorderRef.current?.state === "recording") {
          cancelledRef.current = true;
          recorderRef.current.stop();
        }
      } catch {
        /* already stopped */
      }
      releaseStream();
    },
    [releaseStream]
  );

  const start = useCallback(async () => {
    setError("");

    if (!isRecordingSupported()) {
      setError("Voice recording is not supported in this browser.");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorderRef.current = recorder;
      recorder.start();

      setRecording(true);
      setSeconds(0);

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      return true;
    } catch (caught) {
      releaseStream();

      setError(
        caught?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings to record."
          : "Could not start recording."
      );

      return false;
    }
  }, [releaseStream]);

  /**
   * Resolves with { blob, duration } — or null when the recording was
   * cancelled or produced nothing.
   */
  const stop = useCallback(
    ({ cancel = false } = {}) =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;

        clearInterval(timerRef.current);

        if (!recorder || recorder.state === "inactive") {
          setRecording(false);
          releaseStream();
          resolve(null);
          return;
        }

        cancelledRef.current = cancel;
        const duration = seconds;

        recorder.onstop = () => {
          const chunks = chunksRef.current;
          chunksRef.current = [];

          setRecording(false);
          setSeconds(0);
          releaseStream();

          if (cancelledRef.current || chunks.length === 0) {
            resolve(null);
            return;
          }

          const blob = new Blob(chunks, {
            type: recorder.mimeType || "audio/webm",
          });

          resolve({ blob, duration });
        };

        recorder.stop();
      }),
    [seconds, releaseStream]
  );

  return { recording, seconds, error, start, stop, setError };
}

export default useVoiceRecorder;
