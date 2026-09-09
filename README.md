# HealthCare Pro — Hospital Management System

A modern, responsive hospital management dashboard built with React, Vite,
React Router, Context API, Tailwind CSS, Framer Motion, Chart.js, and Axios.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).
Log in with **any email and password** — auth is a demo stub (see below).

To build for production:

```bash
npm run build
npm run preview
```

## What's fully working

- **Routing** — React Router with a protected route group; unauthenticated
  users are redirected to `/login`.
- **Auth** — Context-based session (stored in `sessionStorage`). Demo only:
  any credentials log you in. Swap `src/context/AuthContext.jsx`'s `login()`
  for a real API call when you have a backend.
- **Dashboard** — animated stat cards, revenue line chart, department pie
  chart, appointments bar chart, a real calendar widget, recent activity feed.
- **Patients** — full CRUD (add/edit/delete) against in-memory state,
  search, department filter, and a detail drawer with medical history.
- **Doctors** — directory with specialization filter and search.
- **Appointments** — book / reschedule / cancel, status filter, sortable +
  paginated table.
- **Departments, Pharmacy, Laboratory, Billing, Emergency, Reports** — each
  fully wired to dummy JSON data with search/filter where it makes sense.
- **Billing & Reports** — real CSV export (downloads an actual `.csv` file).
- **Dark mode** — theme toggle persisted to `localStorage`, applied via
  Tailwind's `dark:` variant.
- **Notifications dropdown**, **glassmorphism UI**, **page transitions**,
  **card hover/count-up animations** — all functional.

## What's stubbed (by design — these are large sub-projects on their own)

- **AI Chat Assistant** (`src/components/AIChatWidget.jsx`) — UI is fully
  built and functional, but replies are canned/random. Point it at a real
  LLM endpoint (e.g. the Claude API) to make it live.
- **Voice Search** (`src/components/SearchBar.jsx`) — uses the browser's
  built-in Web Speech API where supported. No server-side speech processing.
- **Multi-language** — the language selector in Profile is UI-only. Wire it
  to a library like `react-i18next` to actually translate content.
- **QR codes for patients** — not implemented. Add a library like
  `qrcode.react` and generate one from each patient's `id` if needed.
- **PDF export** — CSV export is real; PDF would need a library like
  `jsPDF` or a server-side renderer, left out to keep the dependency list
  lean.

## Connecting a real backend

All data currently lives in `src/data/*.json` and is loaded directly into
page state. `src/services/api.js` already has an Axios instance and typed
request helpers (`patientsAPI`, `doctorsAPI`, `appointmentsAPI`) ready to
go — point `VITE_API_BASE_URL` at your API and swap the JSON imports for
these calls.

## Project structure

```
healthcare-pro/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx
    ├── App.jsx                # routes + providers
    ├── index.css              # Tailwind + glassmorphism utility classes
    ├── components/            # Navbar, Sidebar, Footer, cards, tables, charts, etc.
    ├── pages/                 # one file per route
    ├── context/                # AuthContext, ThemeContext
    ├── hooks/                  # useAuth, useTheme, useDebounce
    ├── services/api.js         # Axios instance + request helpers
    ├── utils/format.js         # currency/date/status formatting
    └── data/*.json             # dummy data backing every module
```

## Note on this build

This was assembled and reviewed file-by-file, but **not** run through an
actual `npm install && npm run build` in the environment that produced it
(no network access there). Run the install locally and let me know if
anything errors — happy to fix it fast.
