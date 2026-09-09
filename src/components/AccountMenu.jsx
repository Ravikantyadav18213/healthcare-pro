import React from "react";
import { useNavigate } from "react-router-dom";
import { FiLogOut } from "react-icons/fi";

import { ConfirmDialog } from "./ui/Modal.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { roleLabel } from "../constants/roles.js";

/* ==================================================================
   ACCOUNT CONTROLS

   The avatar and the sign-out button, in one place so the navbar and
   the sidebar cannot drift apart. Which one renders them depends on
   whether the sidebar is open — see Navbar.jsx and Sidebar.jsx.

     panel  — full sidebar: avatar, name, role, sign-out
     rail   — compact sidebar: avatar and sign-out, stacked
     drawer — phone drawer: avatar, name, email, sign-out
     bar    — navbar: avatar and sign-out, inline
================================================================== */

export default function AccountMenu({
  variant = "bar",
  onNavigate,
  tabIndex = 0,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const openProfile = () => {
    /* The phone drawer has to close behind the navigation. */
    if (onNavigate) onNavigate();
    navigate("/profile");
  };

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    setSigningOut(false);
    setConfirmOpen(false);
    navigate("/login", { replace: true });
  };

  const initial =
    user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";

  const dialog = (
    <ConfirmDialog
      open={confirmOpen}
      onCancel={() => setConfirmOpen(false)}
      onConfirm={handleLogout}
      loading={signingOut}
      tone="danger"
      title="Sign out"
      message="You will be returned to the sign-in page and your session will be ended on this device."
      confirmLabel="Sign out"
    />
  );

  const avatar = (
    <button
      type="button"
      onClick={openProfile}
      title={user?.name || "Profile"}
      aria-label="Open profile"
      tabIndex={tabIndex}
      className="w-9 h-9 shrink-0 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-200 flex items-center justify-center font-semibold text-sm hover:scale-105 transition-transform"
    >
      {initial}
    </button>
  );

  const signOut = (
    <button
      type="button"
      onClick={() => setConfirmOpen(true)}
      title="Sign out"
      aria-label="Sign out"
      tabIndex={tabIndex}
      className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
    >
      <FiLogOut size={17} />
    </button>
  );

  if (variant === "panel") {
    return (
      <>
        <div className="mt-2 pt-3 border-t border-slate-200/70 dark:border-slate-700/50 flex items-center gap-3">
          {avatar}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">
              {user?.name || "Account"}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {user?.role ? roleLabel(user.role) : "Account"}
            </p>
          </div>

          {signOut}
        </div>

        {dialog}
      </>
    );
  }

  if (variant === "drawer") {
    return (
      <>
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center gap-3">
          {avatar}

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate text-slate-700 dark:text-slate-200">
              {user?.name}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>

          {signOut}
        </div>

        {dialog}
      </>
    );
  }

  if (variant === "rail") {
    return (
      <>
        <div className="mt-2 pt-3 border-t border-slate-200/70 dark:border-slate-700/50 flex flex-col items-center gap-1">
          {avatar}
          {signOut}
        </div>

        {dialog}
      </>
    );
  }

  return (
    <>
      {avatar}
      {signOut}
      {dialog}
    </>
  );
}
