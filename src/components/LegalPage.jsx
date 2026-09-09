import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiArrowLeft, FiChevronDown, FiFileText } from "react-icons/fi";

import Logo from "./Logo.jsx";
import { useAuth } from "../hooks/useAuth.js";

/* ==================================================================
   LEGAL PAGE

   The shared shell behind Privacy Policy and Terms & Conditions:
   a bar that stays put while the page scrolls, the way back sitting
   in that bar rather than at the far bottom of the document, and the
   clauses as an accordion so the whole policy can be scanned at once
   and only the relevant part opened.
================================================================== */

function Accordion({ index, section, open, onToggle }) {
  const Icon = section.icon || FiFileText;
  const panelId = `legal-panel-${index}`;
  const buttonId = `legal-button-${index}`;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 last:border-0">
      <h3>
        <button
          id={buttonId}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full flex items-center gap-3 sm:gap-4 py-4 text-left group"
        >
          <span
            className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
              open
                ? "bg-brand-100 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
            }`}
          >
            <Icon size={16} />
          </span>

          <span className="flex-1 min-w-0 font-semibold text-[0.9375rem] sm:text-base">
            {section.title}
          </span>

          <span
            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${
              open
                ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                : "text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-800"
            }`}
          >
            <FiChevronDown
              size={17}
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pl-12 sm:pl-14 pr-2 pb-5 text-sm sm:text-[0.9375rem] leading-7 text-slate-600 dark:text-slate-400">
              {section.body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LegalPage({
  icon: PageIcon,
  eyebrow,
  title,
  updated,
  sections,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated, isAdmin } = useAuth();

  /* Opening the first clause makes it obvious the rows expand. */
  const [openIndex, setOpenIndex] = useState(0);

  const fromDashboard = location.state?.from === "dashboard" && isAuthenticated;

  const handleBack = () => {
    if (!fromDashboard) {
      navigate("/");
      return;
    }

    navigate(isAdmin ? "/admin" : "/dashboard");
  };

  const backLabel = fromDashboard ? "Back to Dashboard" : "Back to Home";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300">
      {/* ---------- bar: stays put while the page scrolls ---------- */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="w-10 h-10 shrink-0" />

            <div className="min-w-0">
              <p className="font-bold leading-tight truncate">HealthCare Pro</p>
              <p className="text-[11px] text-slate-400 truncate">{title}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="shrink-0 inline-flex items-center gap-2 px-3 sm:px-4 h-10 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm hover:shadow transition-all"
          >
            <FiArrowLeft size={16} />
            <span className="hidden sm:inline">{backLabel}</span>
            <span className="sm:hidden">Back</span>
          </button>
        </div>
      </header>

      {/* ---------- content ---------- */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5 sm:p-8 md:p-10">
          <div className="mb-6 sm:mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 text-sm font-semibold">
              <PageIcon size={15} />
              {eyebrow}
            </span>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mt-4">
              {title}
            </h2>

            <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm sm:text-base">
              Last updated: {updated}
            </p>
          </div>

          <div>
            {sections.map((section, index) => (
              <Accordion
                key={section.title}
                index={index}
                section={section}
                open={openIndex === index}
                onToggle={() =>
                  setOpenIndex((current) => (current === index ? -1 : index))
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
