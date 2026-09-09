import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DICTIONARIES,
  LANGUAGES,
  DEFAULT_LANGUAGE,
} from "../i18n/translations.js";
import { useAuth } from "../hooks/useAuth.js";
import { authService } from "../services/authService.js";

/* ==================================================================
   LANGUAGE

   The chosen language lives in two places on purpose:

     - localStorage, so the very first paint after a reload is already
       in the right language rather than flashing English while
       /auth/me is still in flight
     - the user row, so the choice follows the account to another
       device

   The account value wins once it arrives, since it is the one the
   person actually set.
================================================================== */

const STORAGE_KEY = "hcpro.language";

const LanguageContext = createContext(null);

function readStored() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return DICTIONARIES[stored] ? stored : DEFAULT_LANGUAGE;
  } catch {
    /* Private mode, or storage blocked entirely. */
    return DEFAULT_LANGUAGE;
  }
}

export function LanguageProvider({ children }) {
  const { user, isAuthenticated } = useAuth();

  const [language, setLanguageState] = useState(readStored);

  /* Adopt the account's language once the session resolves. */
  useEffect(() => {
    const fromAccount = user?.language;

    if (fromAccount && DICTIONARIES[fromAccount] && fromAccount !== language) {
      setLanguageState(fromAccount);

      try {
        localStorage.setItem(STORAGE_KEY, fromAccount);
      } catch {
        /* nothing to do — the in-memory value still applies */
      }
    }
    /* `language` is deliberately not a dependency: this should react
       to the account changing, not to the user picking a language. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.language]);

  /* Screen readers and browser features (hyphenation, spellcheck)
     key off this, so it has to follow the choice. */
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback(
    async (next) => {
      if (!DICTIONARIES[next]) return;

      setLanguageState(next);

      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }

      /* Persisting to the account is best-effort: a failed save must
         not undo a choice the person can already see applied. */
      if (isAuthenticated) {
        try {
          await authService.setLanguage(next);
        } catch {
          /* keep the local choice */
        }
      }
    },
    [isAuthenticated]
  );

  const value = useMemo(() => {
    const dictionary = DICTIONARIES[language] || DICTIONARIES[DEFAULT_LANGUAGE];
    const base = DICTIONARIES[DEFAULT_LANGUAGE];

    /**
     * Translate a key.
     *
     * Falls back to English, then to the `fallback` argument, then to
     * the key itself — a missing translation should read as words, not
     * as "nav.dashboard".
     */
    const t = (key, fallback) => dictionary[key] ?? base[key] ?? fallback ?? key;

    return { language, setLanguage, t, languages: LANGUAGES };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used inside <LanguageProvider>.");
  }

  return context;
}

/** Convenience: `const t = useT()` for components that only translate. */
export function useT() {
  return useLanguage().t;
}

export default LanguageContext;
