import React from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiShield, FiZap, FiClock, FiArrowLeft } from "react-icons/fi";

import Logo from "./Logo.jsx";

/* ==================================================================
   AUTH SHELL

   The two-column frame shared by sign in and sign up: a brand panel on
   the left and the form card on the right. Only the card differs
   between the two pages, which is also what the page-turn animates —
   see AuthTransition.

   Below lg the brand panel has nowhere to go, so it collapses to a
   compact header above the card rather than being stacked at full
   height and pushing the form off the screen.
================================================================== */

const FEATURES = [
  {
    icon: FiShield,
    title: "Secure & Safe",
    text: "Your data is protected with enterprise security",
  },
  {
    icon: FiZap,
    title: "Easy Access",
    text: "Access your hospital dashboard in one click",
  },
  {
    icon: FiClock,
    title: "24/7 Support",
    text: "We are here to help you anytime",
  },
];

export default function AuthLayout({
  heading,
  subheading,
  headingKey,
  reduceMotion = false,
  children,
}) {
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <div className="flex flex-col lg:flex-row lg:h-screen">

        {/* ---------- brand panel ---------- */}
        <div className="relative lg:w-[46%] shrink-0 lg:sticky lg:top-0 lg:h-screen overflow-hidden bg-gradient-to-br from-brand-100 via-brand-50 to-white">

          {/* Soft colour wash, so the panel reads as one surface rather
              than a flat block. */}
          <div
            aria-hidden="true"
            className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-300/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-sky-300/25 blur-3xl"
          />

          <div className="relative h-full flex flex-col gap-6 px-6 sm:px-10 lg:px-12 xl:px-14 py-6 lg:py-8 lg:overflow-y-auto">

            <Link
              to="/"
              className="inline-flex items-center gap-3 shrink-0 w-fit"
            >
              <Logo className="w-11 h-11 shrink-0" />

              <span className="min-w-0">
                <span className="block font-bold text-lg leading-tight text-slate-800">
                  HealthCare <span className="text-brand-600">Pro</span>
                </span>
                <span className="block text-xs text-slate-500">
                  Smart Hospital Management
                </span>
              </span>
            </Link>

            {/* The headline and the feature list are desktop furniture:
                on a phone they would push the form below the fold. */}
            <div className="hidden lg:block my-auto shrink-0">

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={headingKey || heading}
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
                  transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h1 className="text-3xl xl:text-4xl font-bold text-slate-800 leading-tight">
                    {heading}
                  </h1>

                  <p className="text-slate-500 mt-3 max-w-sm leading-6">
                    {subheading}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div className="mt-8 space-y-5">
                {FEATURES.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-4">
                    <span className="w-10 h-10 shrink-0 rounded-full bg-white text-brand-600 flex items-center justify-center shadow-sm ring-1 ring-brand-100">
                      <Icon size={18} />
                    </span>

                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">
                        {title}
                      </span>
                      <span className="block text-sm text-slate-500 mt-0.5 max-w-[15rem] leading-6">
                        {text}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Link
              to="/"
              className="hidden lg:inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition shrink-0 w-fit"
            >
              <FiArrowLeft size={16} />
              Back to Home
            </Link>
          </div>
        </div>

        {/*
          ---------- form card ----------
          The brand panel is pinned (lg:sticky above); this column is
          where the actual scrolling happens once a form is taller
          than the viewport (Sign Up, with its longer field list, is
          the case that matters here). `overflow-y-auto` goes on this
          outer, non-flex layer and the centering flex lives on the
          inner one — putting `items-center` directly on a scrolling
          flex container is a well-known bug: the browser clips
          content that overflows above the container instead of
          letting it scroll into view. `min-h-full` (not `h-full`) on
          the inner layer keeps short forms (Login) vertically
          centered while still letting tall ones grow past it.
        */}
        <div className="flex-1 min-w-0 lg:h-screen lg:overflow-y-auto">
          <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-6 lg:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
