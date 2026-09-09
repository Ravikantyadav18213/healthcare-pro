import React, { useEffect, useId, useRef, useState } from "react";

/* ==================================================================
   SIGN IN / UP WITH GOOGLE

   Renders Google's own button via the Identity Services script rather
   than a hand-drawn look-alike, so the box that appears is the real
   consent flow, not a decoration in front of one. The script is
   fetched once and shared across every mount — a second page visiting
   this component does not refetch or re-append the tag.

   With no VITE_GOOGLE_CLIENT_ID configured, nothing google-shaped
   renders at all: a dead "Sign in with Google" button that does
   nothing on click is worse than no button.
================================================================== */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/* So a page can skip rendering the "OR" divider too, rather than
   leaving one floating over an empty gap when there is no button. */
export const googleSignInAvailable = Boolean(CLIENT_ID);

let scriptPromise = null;

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);

      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("gis-load-failed")));
        return;
      }

      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("gis-load-failed"));
      document.head.appendChild(script);
    });
  }

  return scriptPromise;
}

/**
 * @param onCredential  (credential: string) => Promise<void> | void —
 *                      called with the signed JWT once the person
 *                      completes the Google flow.
 * @param text          "signin_with" | "signup_with" — the label
 *                      printed on Google's own button.
 */
export default function GoogleSignInButton({ onCredential, text = "signin_with" }) {
  const holderId = `gsi-btn-${useId().replace(/:/g, "")}`;
  const holderRef = useRef(null);
  const [failed, setFailed] = useState(false);

  /* Kept in a ref so the Google callback — registered once at mount —
     always reaches whatever onCredential the latest render passed,
     without having to reinitialise the button on every keystroke
     elsewhere on the page. */
  const handlerRef = useRef(onCredential);
  useEffect(() => {
    handlerRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;

    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !holderRef.current) return;

        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => {
            handlerRef.current?.(response.credential);
          },
          /* FedCM's auto-selected One Tap prompt is skipped — the
             button below is the only Google entry point on this page,
             so there is exactly one place sign-in can start from. */
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(holderRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "left",
          width: holderRef.current.offsetWidth || 320,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!CLIENT_ID || failed) return null;

  return <div id={holderId} ref={holderRef} className="w-full flex justify-center" />;
}
