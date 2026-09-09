import api, { unwrap } from "./api.js";

export const authService = {
  register: (payload) => unwrap(api.post("/auth/register", payload)),

  /*
   * remember = false (the default) issues browser-session cookies, so
   * closing the browser signs the user out.
   */
  login: (email, password, remember = false) =>
    unwrap(api.post("/auth/login", { email, password, remember })),

  /* Second half of a 2FA sign-in: the session only exists once the
     emailed code is redeemed against the challenge. */
  verifyTwoFactor: (challenge, code, remember = false) =>
    unwrap(api.post("/auth/verify-2fa", { challenge, code, remember })),

  resendTwoFactor: (email, password) =>
    unwrap(api.post("/auth/resend-2fa", { email, password })),

  setTwoFactor: (enabled) => unwrap(api.patch("/auth/two-factor", { enabled })),

  setLanguage: (language) => unwrap(api.patch("/auth/language", { language })),

  logout: () => unwrap(api.post("/auth/logout")),

  logoutAll: () => unwrap(api.post("/auth/logout-all")),

  /* Called once on app start to restore the session from the cookie. */
  me: () => unwrap(api.get("/auth/me")),

  refresh: () => unwrap(api.post("/auth/refresh")),

  updateProfile: (payload) => unwrap(api.patch("/auth/profile", payload)),

  changePassword: (currentPassword, newPassword) =>
    unwrap(api.post("/auth/change-password", { currentPassword, newPassword })),

  /* credential is the signed JWT Google's own button hands back —
     never a password, and this app never sees the user's Google one. */
  google: (credential, remember = false) =>
    unwrap(api.post("/auth/google", { credential, remember })),

  forgotPassword: (email) => unwrap(api.post("/auth/forgot-password", { email })),

  verifyResetOtp: (email, otp) =>
    unwrap(api.post("/auth/verify-reset-otp", { email, otp })),

  resetPassword: (email, otp, newPassword) =>
    unwrap(api.post("/auth/reset-password", { email, otp, newPassword })),
};

export default authService;
