import { useCallback, useEffect, useState } from "react";

/* ==================================================================
   BROWSER (DESKTOP) NOTIFICATIONS

   The in-app bell only works while the tab is open and looked at.
   This raises the same events as OS notifications so a doctor with
   the tab in the background still sees an approval or a new message.

   Permission is never requested on page load — browsers penalise
   that, and it reads as hostile. It is asked for only when the person
   turns the setting on themselves.
================================================================== */

const STORAGE_KEY = "hcpro.desktopNotifications";

export const notificationsSupported =
  typeof window !== "undefined" && "Notification" in window;

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writePreference(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* private mode — the in-memory value still applies this session */
  }
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState(() =>
    notificationsSupported ? Notification.permission : "unsupported"
  );

  /* Wanting them and being allowed them are different things: a
     browser can revoke permission after the preference was saved. */
  const [enabled, setEnabled] = useState(readPreference);

  const active = enabled && permission === "granted";

  useEffect(() => {
    if (!notificationsSupported) return;
    setPermission(Notification.permission);
  }, []);

  /** Ask the browser, then remember the answer. Returns the outcome. */
  const enable = useCallback(async () => {
    if (!notificationsSupported) return "unsupported";

    let result = Notification.permission;

    if (result === "default") {
      try {
        result = await Notification.requestPermission();
      } catch {
        result = "denied";
      }
    }

    setPermission(result);

    const granted = result === "granted";
    setEnabled(granted);
    writePreference(granted);

    return result;
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    writePreference(false);
  }, []);

  /**
   * Raise one notification.
   *
   * Suppressed while the tab is actually visible — the bell and the
   * toast already cover that case, and doubling up is noise.
   */
  const notify = useCallback(
    ({ title, body, tag, onClick }) => {
      if (!active) return null;
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        return null;
      }

      try {
        const notification = new Notification(title || "HealthCare Pro", {
          body: body || "",
          icon: "/favicon.svg",
          badge: "/favicon.svg",
          /* Same tag replaces rather than stacks, so ten chat messages
             do not become ten separate OS notifications. */
          tag: tag || "hcpro",
          renotify: Boolean(tag),
        });

        notification.onclick = () => {
          window.focus();
          onClick?.();
          notification.close();
        };

        return notification;
      } catch {
        return null;
      }
    },
    [active]
  );

  return {
    supported: notificationsSupported,
    permission,
    enabled: active,
    /* True when the browser has hard-blocked us: the toggle should
       explain that rather than pretending it can be turned on. */
    blocked: permission === "denied",
    enable,
    disable,
    notify,
  };
}

export default useBrowserNotifications;
