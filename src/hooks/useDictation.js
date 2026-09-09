import { useCallback, useEffect, useRef, useState } from "react";

/* ==================================================================
   SPEAK-TO-TYPE

   The browser's Web Speech API, wrapped for the chat composer: what
   is spoken lands in the draft as text, the same way WhatsApp's
   keyboard dictation works. Nothing is uploaded — recognition runs in
   the browser, unlike a voice note, which is a real audio file.

   Chrome and Edge implement it; Firefox does not. `supported` lets a
   component hide the button rather than offer something that will
   never fire.
================================================================== */

function getRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export const isDictationSupported = () => Boolean(getRecognition());

/**
 * @param onResult called with the full text recognised so far, meant
 *                 to be appended to whatever the user already typed.
 */
export function useDictation(onResult) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const finalRef = useRef("");

  /* Kept in a ref so restarting recognition never closes over a stale
     callback from an earlier render. */
  const handlerRef = useRef(onResult);
  useEffect(() => {
    handlerRef.current = onResult;
  }, [onResult]);

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* nothing was running */
      }
    },
    []
  );

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* nothing was running */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getRecognition();

    if (!SpeechRecognition) {
      setError("Speech input is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    setError("");

    /* Toggle off if it is already running. */
    if (recognitionRef.current) {
      stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    finalRef.current = "";

    recognition.onresult = (event) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];

        if (result.isFinal) {
          finalRef.current += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }

      handlerRef.current?.(`${finalRef.current}${interim}`.trimStart());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone access was blocked. Allow it to dictate messages.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("Speech input stopped unexpectedly.");
      }

      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setError("Could not start speech input.");
    }
  }, [stop]);

  return { listening, error, start, stop, supported: isDictationSupported() };
}

export default useDictation;
