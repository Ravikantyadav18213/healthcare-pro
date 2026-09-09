import React from "react";
import {
  FiSun,
  FiMoon,
  FiMenu,
  FiChevronsLeft,
  FiChevronsRight,
} from "react-icons/fi";

import SearchBar from "./SearchBar.jsx";
import Notification from "./Notification.jsx";
import AccountMenu from "./AccountMenu.jsx";

import { useTheme } from "../hooks/useTheme.js";
import { useAuth } from "../hooks/useAuth.js";
import Logo from "./Logo.jsx";

export default function Navbar({
  search,
  setSearch,
  onOpenMenu,
  onToggleSidebar,
  sidebarCollapsed = false,
}) {
  const { dark, toggleTheme } = useTheme();
  const { isAdmin, isDoctor } = useAuth();

  return (
    <>
      <header className="sticky top-0 z-40 mx-4 glass px-3 sm:px-4 py-3">
        <div className="flex items-center gap-2 sm:gap-4">

          {/* Hamburger — phones only; tablets get the compact rail */}
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open navigation menu"
            className="md:hidden shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <FiMenu size={19} />
          </button>

          {/* Collapse toggle — md and up, where a sidebar is present */}
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-pressed={!sidebarCollapsed}
            title={`${sidebarCollapsed ? "Show" : "Hide"} sidebar (Ctrl+B)`}
            className="hidden md:flex shrink-0 w-9 h-9 rounded-xl items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {sidebarCollapsed ? (
              <FiChevronsRight size={19} />
            ) : (
              <FiChevronsLeft size={19} />
            )}
          </button>

          {/* Logo */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Logo className="w-10 h-10 shrink-0" />
            <span
              className={`font-bold text-lg whitespace-nowrap ${
                sidebarCollapsed ? "hidden lg:block" : "hidden xl:block"
              }`}
            >
              HealthCare Pro
            </span>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-0 flex justify-center px-1">
            <SearchBar
              value={search}
              onChange={setSearch}
              role={isAdmin ? "admin" : isDoctor ? "doctor" : "user"}
              placeholder={
                isAdmin
                  ? "Search patients, doctors, appointments..."
                  : isDoctor
                  ? "Search your patients and appointments..."
                  : "Search your reports and appointments..."
              }
            />
          </div>

          {/* Actions */}
          <div className="shrink-0 flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle colour theme"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {dark ? <FiSun size={18} /> : <FiMoon size={18} />}
            </button>

            <Notification />

            {/*
              Account controls live in the sidebar. They fall back to
              the navbar only when the sidebar is collapsed away; on
              phones the drawer holds them instead, so the navbar stays
              uncluttered at every width.
            */}
            <div
              className={`items-center gap-1 sm:gap-2 ${
                sidebarCollapsed ? "hidden md:flex" : "hidden"
              }`}
            >
              <AccountMenu variant="bar" />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
