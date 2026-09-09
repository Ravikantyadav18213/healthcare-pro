import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiShieldOff } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth.js";
import { useT } from "../context/LanguageContext.jsx";
import { homePathFor } from "../constants/roles.js";

/*
 * Reached when a signed-in account requests a route its role does not
 * open — the server already refused the matching API with a 403; this
 * is just the honest page for it instead of a silent bounce.
 */
export default function AccessDenied() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();

  const homePath = homePathFor(user?.role);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center px-6">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
          <FiShieldOff size={36} />
        </div>

        <h1 className="text-3xl font-bold mt-6">
          {t("accessDenied.title", "Access Denied")}
        </h1>

        <p className="text-slate-500 mt-3">
          {t(
            "accessDenied.description",
            "You don't have permission to access this page."
          )}
        </p>

        <div className="flex justify-center gap-3 mt-8">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <FiArrowLeft />
            {t("accessDenied.goBack", "Go Back")}
          </button>

          <Link to={homePath} className="btn-primary inline-flex items-center gap-2">
            {t("accessDenied.goToDashboard", "Go to Dashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
