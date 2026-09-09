// import React from "react";
// import { Link } from "react-router-dom";

// export default function NotFound() {
//   return (
//     <div className="min-h-screen flex flex-col items-center justify-center gap-3">
//       <h1 className="text-4xl font-extrabold text-brand-600">404</h1>
//       <p className="text-slate-500">This page doesn't exist.</p>
//       <Link to="/dashboard" className="btn-primary">Back to Dashboard</Link>
//     </div>
//   );
// }




import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiHome } from "react-icons/fi";

import { useT } from "../context/LanguageContext.jsx";

export default function NotFound() {
  const navigate = useNavigate();
  const t = useT();

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100 flex items-center justify-center px-6">

      <div className="text-center max-w-lg">

        <div className="text-8xl font-extrabold text-brand-600">
          404
        </div>

        <h1 className="text-3xl font-bold mt-4">
          {t("notFound.title", "Page not found")}
        </h1>

        <p className="text-slate-500 mt-3">
          {t(
            "notFound.description",
            "Sorry, the page you're looking for doesn't exist or may have been moved."
          )}
        </p>


        <div className="flex justify-center gap-3 mt-8">

          <button
            onClick={() => navigate(-1)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <FiArrowLeft />
            {t("notFound.goBack", "Go Back")}
          </button>

          <Link
            to="/"
            className="btn-primary inline-flex items-center gap-2"
          >
            <FiHome />
            {t("notFound.home", "Home")}
          </Link>

        </div>

      </div>

    </div>
  );
}