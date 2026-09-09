import React, { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

import Navbar from "./Navbar.jsx";
import Sidebar, { MobileSidebar } from "./Sidebar.jsx";
import Footer from "./Footer.jsx";

const COLLAPSE_KEY = "hcp_sidebar_collapsed";

/*
 * Routes that own the whole viewport instead of sitting in the normal
 * scrolling page: the messaging screens, where the conversation list
 * and the thread each scroll on their own and the page itself never
 * does. The footer is dropped there for the same reason — a chat
 * composer pinned to the bottom cannot share the screen with it.
 */
const FULL_HEIGHT_ROUTES = ["/messages", "/doctor/messages", "/admin/messages"];

export default function Layout() {
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  /* The collapsed choice is remembered between visits. */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      /* private browsing — the preference just will not persist */
    }
  }, [collapsed]);

  /* Clear the search box and close the drawer when the page changes. */
  useEffect(() => {
    setSearch("");
    setMenuOpen(false);
  }, [location.pathname]);

  const fullHeight = FULL_HEIGHT_ROUTES.includes(location.pathname);

  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  /* Ctrl/Cmd + B toggles the sidebar, as in most editors. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  /*
   * The sidebar is fixed, so the content column reserves space for it
   * with padding rather than being a flex sibling. `sidebar-collapsed`
   * on the shell drives both the panel slide-out and the content
   * offset from a single CSS variable (see index.css).
   */
  return (
    <div
      className={`
        app-shell
        ${collapsed ? "sidebar-collapsed" : ""}
        ${
          fullHeight
            ? "h-screen [height:100dvh] overflow-hidden"
            : "min-h-screen overflow-x-clip"
        }

        bg-gradient-to-br
        from-brand-50
        via-white
        to-slate-100

        dark:from-slate-950
        dark:via-slate-950
        dark:to-slate-900
      `}
    >
      {/* Fixed rail / panel — never scrolls with the page */}
      <Sidebar collapsed={collapsed} />

      {/* Phone drawer */}
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        className={`app-content flex flex-col ${
          fullHeight ? "h-screen [height:100dvh] min-h-0" : "min-h-screen"
        }`}
      >
        <Navbar
          search={search}
          setSearch={setSearch}
          onOpenMenu={() => setMenuOpen(true)}
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={collapsed}
        />

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={`flex-1 min-w-0 px-4 ${
            fullHeight ? "min-h-0 overflow-hidden pt-3 pb-4" : "py-5"
          }`}
        >
          <Outlet context={{ search, setSearch }} />
        </motion.main>

        {!fullHeight && <Footer variant="compact" />}
      </div>
    </div>
  );
}
