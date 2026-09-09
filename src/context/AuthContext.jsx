import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import authService from "../services/authService.js";
import { AUTH_EVENT } from "../services/api.js";
import { ROLES } from "../constants/roles.js";

export const AuthContext = createContext(null);

/* ==================================================================
   AUTHENTICATION STATE

   There is no local user database any more. The session lives in an
   HttpOnly cookie issued by the API; this context simply mirrors
   whatever GET /api/auth/me reports.
================================================================== */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  /* True until the first /auth/me call settles, so ProtectedRoute
     does not bounce a signed-in user to /login on a hard refresh. */
  const [initialising, setInitialising] = useState(true);

  const [sessionMessage, setSessionMessage] = useState("");

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* ---------------- restore session on boot ---------------- */

  const restore = useCallback(async () => {
    try {
      const data = await authService.me();
      if (mounted.current) setUser(data.user);
      return data.user;
    } catch {
      if (mounted.current) setUser(null);
      return null;
    } finally {
      if (mounted.current) setInitialising(false);
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  /* ---------------- react to expired sessions ---------------- */

  useEffect(() => {
    const onExpired = () => {
      if (!mounted.current) return;

      setUser((current) => {
        if (current) {
          setSessionMessage("Your session expired. Please sign in again.");
        }
        return null;
      });
    };

    window.addEventListener(AUTH_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EVENT, onExpired);
  }, []);

  /* ---------------- actions ---------------- */

  /*
   * Resolves to either { user } or { twoFactorRequired, challenge, ... }.
   *
   * A 2FA account gets NO session here — the server withheld it — so
   * setUser must not run for that branch, or the app would think it
   * was signed in with half the proof.
   */
  const login = useCallback(async (email, password, remember = false) => {
    const data = await authService.login(email, password, remember);

    if (data.twoFactorRequired) return data;

    setUser(data.user);
    setSessionMessage("");
    return data;
  }, []);

  const verifyTwoFactor = useCallback(async (challenge, code, remember = false) => {
    const data = await authService.verifyTwoFactor(challenge, code, remember);
    setUser(data.user);
    setSessionMessage("");
    return data.user;
  }, []);

  /* Unlike normal signup, a Google sign-in DOES start a session
     immediately — Google has already verified the email, so there is
     nothing left to confirm by asking the person to sign in again. */
  const loginWithGoogle = useCallback(async (credential, remember = true) => {
    const data = await authService.google(credential, remember);
    setUser(data.user);
    setSessionMessage("");
    return data.user;
  }, []);

  /*
   * Registration creates the account but does not sign the user in —
   * the API issues no session, so they verify their new credentials on
   * the sign-in form.
   */
  const signup = useCallback(async (payload) => {
    const data = await authService.register(payload);
    setSessionMessage("");
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* Clearing local state matters more than the network result. */
    }
    setUser(null);
    setSessionMessage("");
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const data = await authService.updateProfile(payload);
    setUser(data.user);
    return data.user;
  }, []);

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const data = await authService.changePassword(currentPassword, newPassword);
      /* The API revokes every session after a password change. */
      setUser(null);
      return data;
    },
    []
  );

  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.me();
      setUser(data.user);
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const clearSessionMessage = useCallback(() => setSessionMessage(""), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        initialising,
        sessionMessage,
        clearSessionMessage,

        isAuthenticated: Boolean(user),
        isAdmin: user?.role === ROLES.ADMIN,
        isDoctor: user?.role === ROLES.DOCTOR,
        /*
         * Positive, not "not admin and not doctor". A negation would
         * silently grant the full patient portal to any role added
         * later, or to a user object whose role failed to load.
         */
        isPatient: user?.role === ROLES.PATIENT,

        login,
        verifyTwoFactor,
        loginWithGoogle,
        signup,
        logout,
        updateProfile,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
