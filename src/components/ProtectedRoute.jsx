import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";
import { PageLoader } from "./ui/States.jsx";
import { ROLES } from "../constants/roles.js";

/*
 * Client-side route protection.
 *
 * This is a usability layer only — every protected API endpoint
 * independently verifies the session and role on the server, so a
 * user who edits the URL or the JavaScript still gets a 401/403. This
 * component exists so that server-side rejection is never the FIRST
 * thing the visitor sees: a wrong role is turned away before the page
 * even starts fetching data.
 *
 * Two ways to declare who may enter:
 *   - the three original booleans (adminOnly / doctorOnly / userOnly),
 *     kept so every existing route in App.jsx needs no rewrite
 *   - a generic `roles={["admin","doctor"]}` array for a route that
 *     must admit more than one role, which the booleans cannot express
 * Passing neither means "any authenticated account" (used for /profile
 * and the outer Layout wrapper).
 */

export default function ProtectedRoute({
  children,
  adminOnly = false,
  doctorOnly = false,
  userOnly = false,
  roles = null,
}) {
  const { user, isAuthenticated, isAdmin, isDoctor, isPatient, initialising } = useAuth();
  const location = useLocation();

  /* Wait for GET /auth/me so a hard refresh does not bounce a
     signed-in user to the login page. */
  if (initialising) {
    return <PageLoader label="Restoring your session..." />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }

  /* Compared against the account's own role rather than a fixed list
     of booleans, so a role added later (nurse, receptionist) is
     admitted by naming it in `roles` — no edit needed here. */
  const allowed = !roles ? true : roles.includes(user?.role);

  if (
    !allowed ||
    (adminOnly && !isAdmin) ||
    (doctorOnly && !isDoctor) ||
    /* A patient-only page checks isPatient POSITIVELY — the old
       `!isAdmin && !isDoctor` negation would silently admit any
       future role that is neither of those two. */
    (userOnly && !isPatient)
  ) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}
