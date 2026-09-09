import React, { useId } from "react";

/* ==================================================================
   BRAND MARK

   A medical cross with a pulse trace running through it. Drawn as SVG
   rather than a "+" glyph in a tile so it stays sharp at every size
   and looks the same in every place it appears.

   The caller sizes it — <Logo className="w-11 h-11" /> — and the mark
   fills that box, so existing layout classes keep working.
================================================================== */

export default function Logo({ className = "w-11 h-11", title = "HealthCare Pro" }) {
  /* Unique per instance: several copies of the mark share a page. */
  const gradientId = `hcp-mark-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>

      {/*
        The cross is one path with rounded joins, so the arms keep
        their radius however small the mark is rendered.
      */}
      <path
        d="M18 4h12a2 2 0 0 1 2 2v10h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H32v10a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V32H6a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2h10V6a2 2 0 0 1 2-2Z"
        fill={`url(#${gradientId})`}
      />

      {/*
        The trace sits across the waist of the cross. It is drawn in
        the tile's own white so it reads at 20px as well as at 64px.
      */}
      <path
        d="M9 24h6.5l3-5.5 4.5 11 3.5-7 2.5 4H39"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
