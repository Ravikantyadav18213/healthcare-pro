import React, { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import AuthLayout from "./AuthLayout.jsx";

/* ==================================================================
   SIGN IN <-> SIGN UP

   A layout route over /login and /signup. The shell — panel, brand,
   backdrop — is rendered here and stays put; only the card inside it
   moves, so the background never travels with the content.

   mode="wait" means the outgoing card finishes before the incoming one
   starts, so the two are never on screen together. The pair is tuned
   to land the whole handover a little under 600ms.
================================================================== */

const PAGES = {
  "/login": {
    order: 0,
    heading: "Welcome Back!",
    subheading: "Sign in to continue to your account",
  },
  "/signup": {
    order: 1,
    heading: "Create Your Account",
    subheading: "Join HealthCare Pro and manage your hospital seamlessly",
  },
};

const EASE_IN = [0.22, 1, 0.36, 1];
const EASE_OUT = [0.4, 0, 0.2, 1];

export default function AuthTransition() {
  const location = useLocation();

  /*
   * Resolved here rather than left as <Outlet /> inside the animated
   * element. AnimatePresence keeps the exiting element in state and
   * re-renders it, and Outlet reads the matched route from context —
   * so a retained <Outlet /> re-resolves to the NEW route and the
   * outgoing card vanishes instead of animating out. Calling useOutlet
   * pins the element to the route that was current when it rendered.
   */
  const outlet = useOutlet();

  const page = PAGES[location.pathname] || PAGES["/login"];

  /*
   * Derived during render, not in an effect. An effect runs after
   * AnimatePresence has already resolved the exit, so the outgoing
   * card would animate using the PREVIOUS move's direction and the two
   * halves of the transition would disagree.
   */
  const [previous, setPrevious] = useState(location.pathname);
  const [direction, setDirection] = useState(1);

  if (previous !== location.pathname) {
    const from = PAGES[previous]?.order ?? 0;
    setDirection((page.order ?? 0) >= from ? 1 : -1);
    setPrevious(location.pathname);
  }

  /* Depth is a desktop nicety. On a narrow screen a rotated card
     clips against the edge, so phones get the plain slide. */
  const [depth, setDepth] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  );

  const [reduceMotion, setReduceMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onWide = (event) => setDepth(event.matches);
    const onCalm = (event) => setReduceMotion(event.matches);

    wide.addEventListener("change", onWide);
    calm.addEventListener("change", onCalm);

    return () => {
      wide.removeEventListener("change", onWide);
      calm.removeEventListener("change", onCalm);
    };
  }, []);

  /* Asked for less motion: a short cross-fade, no travel. */
  const variants = reduceMotion
    ? {
        enter: { opacity: 0 },
        centre: { opacity: 1, transition: { duration: 0.16, ease: "linear" } },
        exit: { opacity: 0, transition: { duration: 0.12, ease: "linear" } },
      }
    : {
        enter: (d) => ({
          opacity: 0,
          x: d > 0 ? "26%" : "-26%",
          scale: 0.98,
          rotateY: depth ? (d > 0 ? 7 : -7) : 0,
        }),
        centre: {
          opacity: 1,
          x: "0%",
          scale: 1,
          rotateY: 0,
          transition: { duration: 0.36, ease: EASE_IN },
        },
        exit: (d) => ({
          opacity: 0,
          x: d > 0 ? "-26%" : "26%",
          scale: 0.98,
          rotateY: depth ? (d > 0 ? -7 : 7) : 0,
          transition: { duration: 0.22, ease: EASE_OUT },
        }),
      };

  return (
    <AuthLayout
      heading={page.heading}
      subheading={page.subheading}
      headingKey={location.pathname}
      reduceMotion={reduceMotion}
    >
      {/*
        The card travels sideways, so its lane is clipped — otherwise
        the outgoing card shows past the edge of a phone screen.
        overflow-x: clip rather than hidden: hidden would force the
        other axis to auto and turn this into a scroll container.
      */}
      <div
        className="w-full flex justify-center overflow-x-clip"
        style={depth && !reduceMotion ? { perspective: "1600px" } : undefined}
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={location.pathname}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="centre"
            exit="exit"
            className="w-full flex justify-center"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
