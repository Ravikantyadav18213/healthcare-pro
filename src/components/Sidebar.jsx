import React from "react";
import { NavLink } from "react-router-dom";
import {
  FiGrid, FiUsers, FiUserCheck, FiCalendar, FiLayers,
  FiPackage, FiActivity, FiFileText, FiBarChart2, FiSettings,
  FiAlertCircle, FiShield, FiUser, FiX, FiPlusCircle, FiMessageSquare,
  FiClipboard, FiHeart, FiLogOut, FiUserPlus,
} from "react-icons/fi";

import AccountMenu from "./AccountMenu.jsx";
import { useAuth } from "../hooks/useAuth.js";
import Logo from "./Logo.jsx";
import { roleLabel, ROLES } from "../constants/roles.js";
import { useLanguage } from "../context/LanguageContext.jsx";

/* ==================================================================
   NAVIGATION
================================================================== */

const ADMIN_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: FiGrid },
  { to: "/admin", label: "Admin Control", icon: FiShield },
  { to: "/patients", label: "Patients", icon: FiUsers },
  { to: "/doctors", label: "Doctors", icon: FiUserCheck },
  { to: "/appointments", label: "Appointments", icon: FiCalendar },
  { to: "/departments", label: "Departments", icon: FiLayers },
  { to: "/staff", label: "Staff", icon: FiUserPlus },
  { to: "/admin/messages", label: "Messages", icon: FiMessageSquare },
  { to: "/pharmacy", label: "Pharmacy", icon: FiPackage },
  { to: "/laboratory", label: "Laboratory", icon: FiActivity },
  { to: "/billing", label: "Billing", icon: FiFileText },
  { to: "/emergency", label: "Emergency", icon: FiAlertCircle },
  { to: "/wards", label: "Wards & Beds", icon: FiGrid },
  { to: "/discharge-summaries", label: "Discharges", icon: FiClipboard },
  { to: "/reports", label: "Reports", icon: FiBarChart2 },
  { to: "/profile", label: "Settings", icon: FiSettings },
];

const USER_LINKS = [
  { to: "/dashboard", label: "My Dashboard", icon: FiGrid },
  { to: "/book-appointment", label: "Book Appointment", icon: FiPlusCircle },
  { to: "/my-appointments", label: "My Appointments", icon: FiCalendar },
  { to: "/my-reports", label: "My Reports", icon: FiFileText },
  { to: "/my-health", label: "Health Timeline", icon: FiHeart },
  { to: "/find-doctors", label: "Find a Doctor", icon: FiUserCheck },
  { to: "/messages", label: "Messages", icon: FiMessageSquare },
  { to: "/profile", label: "My Profile", icon: FiUser },
];

const DOCTOR_LINKS = [
  { to: "/doctor/dashboard", label: "Dashboard", icon: FiGrid },
  { to: "/doctor/appointments", label: "My Appointments", icon: FiCalendar },
  { to: "/doctor/patients", label: "My Patients", icon: FiUsers },
  { to: "/doctor/reports", label: "Reports", icon: FiFileText },
  { to: "/doctor/prescriptions", label: "Prescriptions", icon: FiClipboard },
  { to: "/discharge-summaries", label: "Discharges", icon: FiLogOut },
  { to: "/doctor/messages", label: "Messages", icon: FiMessageSquare },
  { to: "/doctor/profile", label: "My Profile", icon: FiUser },
];

/* Ward-facing clinical staff. A nurse works the beds; a receptionist
   works the front desk and only reads the board. */
const NURSE_LINKS = [
  { to: "/wards", label: "Wards & Beds", icon: FiGrid },
  { to: "/patients", label: "Patients", icon: FiUsers },
  { to: "/appointments", label: "Appointments", icon: FiCalendar },
  { to: "/emergency", label: "Emergency", icon: FiAlertCircle },
  { to: "/laboratory", label: "Laboratory", icon: FiActivity },
  { to: "/discharge-summaries", label: "Discharges", icon: FiLogOut },
  { to: "/profile", label: "My Profile", icon: FiUser },
];

const RECEPTIONIST_LINKS = [
  { to: "/appointments", label: "Appointments", icon: FiCalendar },
  { to: "/patients", label: "Patients", icon: FiUsers },
  { to: "/doctors", label: "Doctors", icon: FiUserCheck },
  { to: "/wards", label: "Bed Availability", icon: FiGrid },
  { to: "/billing", label: "Billing", icon: FiFileText },
  { to: "/discharge-summaries", label: "Discharges", icon: FiLogOut },
  { to: "/profile", label: "My Profile", icon: FiUser },
];

/* Each link's English label doubles as the translation key's fallback,
   so a language with no entry for it still renders real words. */
const LABEL_KEYS = {
  Dashboard: "nav.dashboard",
  "My Dashboard": "nav.myDashboard",
  "Admin Control": "nav.adminControl",
  Patients: "nav.patients",
  Doctors: "nav.doctors",
  Appointments: "nav.appointments",
  "My Appointments": "nav.myAppointments",
  "Book Appointment": "nav.bookAppointment",
  Departments: "nav.departments",
  Staff: "nav.staff",
  Messages: "nav.messages",
  Pharmacy: "nav.pharmacy",
  Laboratory: "nav.laboratory",
  Billing: "nav.billing",
  Emergency: "nav.emergency",
  Reports: "nav.reports",
  "My Reports": "nav.myReports",
  "Wards & Beds": "nav.wards",
  "Bed Availability": "nav.bedAvailability",
  "Health Timeline": "nav.healthTimeline",
  "Find a Doctor": "nav.findDoctor",
  Settings: "nav.settings",
  "My Profile": "nav.myProfile",
  Prescriptions: "nav.prescriptions",
  Discharges: "timeline.discharges",
};

export function useNavLinks() {
  const { user, isAdmin, isDoctor, isPatient } = useAuth();
  const { t } = useLanguage();

  const translate = (links) =>
    links.map((link) => ({
      ...link,
      label: t(LABEL_KEYS[link.label] || link.label, link.label),
    }));

  if (isAdmin) return translate(ADMIN_LINKS);
  if (isDoctor) return translate(DOCTOR_LINKS);
  if (isPatient) return translate(USER_LINKS);
  if (user?.role === ROLES.NURSE) return translate(NURSE_LINKS);
  if (user?.role === ROLES.RECEPTIONIST) return translate(RECEPTIONIST_LINKS);
  /* Hiding a link is a convenience, not a security boundary — the API
     still enforces every route — but an unrecognised role should not
     silently inherit the patient portal's link set either. */
  return [];
}

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    isActive
      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md"
      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
  }`;

/* ==================================================================
   DESKTOP + TABLET SIDEBAR

   Deliberately `fixed`, not `sticky`.

   Sticky positioning resolves against the nearest scrolling ancestor,
   and the page wrapper carries overflow-x-hidden to prevent sideways
   scroll — which turned that wrapper into the scroll container and
   stopped the rail sticking, so it drifted up with the page.
   Fixed positioning is unaffected by ancestor overflow.

   The panel keeps its own inner scrollbar, so a long link list never
   pushes the page around.
================================================================== */

export default function Sidebar({ showIcons = true, collapsed = false }) {
  const links = useNavLinks();

  /*
   * The slide-out itself is handled by `.sidebar-panel` reacting to
   * `.sidebar-collapsed` on the shell. Only the tab order and the
   * accessibility flags are managed here.
   */
  return (
    <>
      {/* ---------- FULL SIDEBAR (lg and up) ---------- */}
      <aside
        aria-hidden={collapsed}
        aria-label="Main navigation"
        className="
          sidebar-panel
          hidden lg:flex flex-col
          fixed left-4 top-0 bottom-4 z-30
          w-60
          glass p-4
        "
      >
        <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overscroll-contain">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              tabIndex={collapsed ? -1 : 0}
              className={linkClass}
            >
              {showIcons && <Icon size={17} className="shrink-0" />}
              {label}
            </NavLink>
          ))}
        </div>

        <AccountMenu variant="panel" />
      </aside>

      {/* ---------- COMPACT RAIL (tablet: md to lg) ---------- */}
      <aside
        aria-hidden={collapsed}
        aria-label="Main navigation"
        className="
          sidebar-panel
          hidden md:flex lg:hidden flex-col
          fixed left-4 top-0 bottom-4 z-30
          w-16
          glass p-2
        "
      >
        <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overscroll-contain">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/dashboard"}
            title={label}
            aria-label={label}
            tabIndex={collapsed ? -1 : 0}
            className={({ isActive }) =>
              `group relative flex items-center justify-center h-11 shrink-0 rounded-xl transition-colors ${
                isActive
                  ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`
            }
          >
            <Icon size={19} className="shrink-0" />

            {/* Hover label, since the rail has no room for text. */}
            <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
        </div>

        <AccountMenu variant="rail" />
      </aside>
    </>
  );
}

/* ==================================================================
   MOBILE DRAWER

   Phones only. Opened by the navbar hamburger; closes on overlay
   click, Escape, or navigation.

   Always mounted and moved with a CSS transform rather than wrapped in
   AnimatePresence — its exit bookkeeping does not settle reliably here
   under React StrictMode, which left the drawer stuck open after
   `open` had already flipped to false.
================================================================== */

export function MobileSidebar({ open, onClose }) {
  const links = useNavLinks();
  const { isAdmin, isDoctor, isPatient } = useAuth();

  /* Escape closes; background scroll is locked while open. */
  React.useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`drawer-overlay md:hidden fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm ${
          open ? "is-open" : ""
        }`}
      />

      <aside
        /*
         * The panel stays mounted for the slide animation, so it must
         * only present itself as a modal dialog while it is actually
         * open — otherwise it shadows real dialogs for assistive tech
         * and for any [role=dialog] lookup.
         */
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-label="Main navigation"
        aria-hidden={!open}
        className={`drawer-panel md:hidden fixed inset-y-0 left-0 z-[85] w-[82%] max-w-xs flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl ${
          open ? "is-open" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <Logo className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                HealthCare Pro
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {isAdmin
                  ? "Administrator"
                  : isDoctor
                  ? "Doctor portal"
                  : isPatient
                  ? "Patient portal"
                  : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            tabIndex={open ? 0 : -1}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <FiX size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/dashboard"}
              onClick={onClose}
              tabIndex={open ? 0 : -1}
              className={linkClass}
            >
              <Icon size={17} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <AccountMenu
          variant="drawer"
          onNavigate={onClose}
          tabIndex={open ? 0 : -1}
        />
      </aside>
    </>
  );
}
