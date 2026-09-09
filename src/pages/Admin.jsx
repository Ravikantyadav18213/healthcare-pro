import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiUsers,
  FiUserCheck,
  FiUserX,
  FiUserPlus,
  FiAlertTriangle,
  FiActivity,
  FiSearch,
  FiRefreshCw,
  FiShield,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiMail,
  FiCalendar,
  FiPlus,
  FiLock,
  FiEye,
  FiFileText,
  FiTrendingUp,
  FiTrash2,
  FiMessageSquare,
  FiCornerUpLeft,
} from "react-icons/fi";

import adminService, { contactService } from "../services/adminService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { useDebouncedValue } from "../hooks/useApi.js";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonCards, SkeletonTable, SkeletonList } from "../components/ui/Skeleton.jsx";
import RowActionsMenu from "../components/ui/RowActionsMenu.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { ROLES, roleLabel } from "../constants/roles.js";
import { padRefresh } from "../utils/timing.js";

/* The badge used to branch only on admin/not-admin, so a doctor row
   rendered identically to a patient row — the one screen built for
   auditing accounts could not visually tell them apart. */
function roleBadgeClass(role) {
  if (role === ROLES.ADMIN) {
    return "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  }
  if (role === ROLES.DOCTOR) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  return "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300";
}

const AUDIT_TONES = {
  problem: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20",
  admin: "border-purple-200 bg-purple-50 dark:border-purple-900/60 dark:bg-purple-950/20",
  normal: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50",
};

const PROBLEM_ACTIONS = ["login_failed", "register_failed", "access_denied"];

/* Column headings for the users table. The key is looked up first, the
   English label is the fallback, so nothing breaks before the
   dictionary catches up. */
const USER_COLUMNS = [
  { key: "admin.col.user", label: "User" },
  { key: "admin.col.contact", label: "Contact" },
  { key: "label.role", label: "Role" },
  { key: "label.status", label: "Status" },
  { key: "admin.col.registered", label: "Registered" },
  { key: "admin.col.lastLogin", label: "Last Login" },
  { key: "admin.col.logins", label: "Logins" },
  { key: "label.actions", label: "Actions" },
];

function auditTone(action) {
  if (PROBLEM_ACTIONS.includes(action)) return "problem";
  if (action.startsWith("admin_") || action.startsWith("doctor_") ||
      action.startsWith("user_") || action.startsWith("report_") ||
      action.startsWith("patient_")) {
    return "admin";
  }
  return "normal";
}

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  /* Set when "Problems" is clicked on the stat row — narrows the
     audit list, already loaded, to the same three actions the
     Problems count itself is computed from server-side
     (userService.userStats: login_failed / register_failed /
     access_denied). Purely a client-side view filter, no extra
     request. */
  const [auditProblemsOnly, setAuditProblemsOnly] = useState(false);

  /* Set when "New This Week" is clicked — narrows the users list to
     the same rolling 7-day window the count itself is computed from
     server-side (userService.userStats: created_at >= datetime('now',
     '-7 days')). "This week" here means the last 7 days, not the
     current calendar week, so it can never include anything dated
     into the future — a signup from "next week" cannot be in the
     past 7 days. */
  const [newThisWeekOnly, setNewThisWeekOnly] = useState(false);

  const [statusTarget, setStatusTarget] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const [detailUser, setDetailUser] = useState(null);

  const usersSectionRef = useRef(null);
  const auditSectionRef = useRef(null);

  const visibleAudit = useMemo(
    () =>
      auditProblemsOnly
        ? audit.filter((entry) => auditTone(entry.action) === "problem")
        : audit,
    [audit, auditProblemsOnly]
  );

  const visibleUsers = useMemo(() => {
    if (!newThisWeekOnly) return users;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.filter((row) => {
      const created = new Date(row.createdAt).getTime();
      return Number.isFinite(created) && created >= sevenDaysAgo;
    });
  }, [users, newThisWeekOnly]);

  const term = useDebouncedValue(search, 350);
  const auditTerm = useDebouncedValue(auditSearch, 350);

  const load = useCallback(
    async (isRefresh = false) => {
      const startedAt = Date.now();
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);

      try {
        const [userData, auditData] = await Promise.all([
          adminService.users({ search: term, status: statusFilter }),
          adminService.audit({ search: auditTerm, limit: 60 }),
        ]);

        setUsers(userData.users);
        setStats(userData.stats);
        setAudit(auditData.logs);
      } catch (caught) {
        setError(caught);
      } finally {
        await padRefresh(isRefresh, startedAt);
        setLoading(false);
        setRefreshing(false);
      }
    },
    [term, statusFilter, auditTerm]
  );

  useEffect(() => {
    load();
  }, [load]);

  /* ---------------- contact messages ----------------
     Loaded independently of the users/audit search cycle above —
     nothing here depends on `term`/`auditTerm`/`statusFilter`, so
     tying it to that effect would just mean pointless refetches. */

  const [contactMessages, setContactMessages] = useState([]);
  const [contactStats, setContactStats] = useState({ total: 0, unread: 0 });
  const [contactLoading, setContactLoading] = useState(true);
  const [contactStatusFilter, setContactStatusFilter] = useState("All");
  const [deleteContactTarget, setDeleteContactTarget] = useState(null);
  const [contactDeleting, setContactDeleting] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState("");
  const [replySending, setReplySending] = useState(false);

  const loadContactMessages = useCallback(async () => {
    setContactLoading(true);

    try {
      const data = await contactService.list({ status: contactStatusFilter });
      setContactMessages(data.messages);
      setContactStats(data.stats);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setContactLoading(false);
    }
  }, [contactStatusFilter, toast]);

  useEffect(() => {
    loadContactMessages();
  }, [loadContactMessages]);

  const markContactRead = async (row) => {
    try {
      await contactService.markRead(row.id);
      setContactMessages((current) =>
        current.map((item) => (item.id === row.id ? { ...item, status: "read" } : item))
      );
      setContactStats((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }));
    } catch (caught) {
      toast.error(caught.message);
    }
  };

  const confirmDeleteContact = async () => {
    setContactDeleting(true);

    try {
      await contactService.remove(deleteContactTarget.id);
      toast.success("Message deleted.");
      setDeleteContactTarget(null);
      loadContactMessages();
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setContactDeleting(false);
    }
  };

  const openReply = (row) => {
    setReplyTarget(row);
    setReplyText("");
    setReplyError("");
  };

  const submitReply = async (event) => {
    event.preventDefault();

    if (replyText.trim().length < 2) {
      setReplyError("Enter a reply message.");
      return;
    }

    setReplySending(true);
    setReplyError("");

    try {
      await contactService.reply(replyTarget.id, replyText.trim());
      toast.success(`Reply sent to ${replyTarget.email}.`);
      setReplyTarget(null);
      loadContactMessages();
    } catch (caught) {
      setReplyError(caught.message);
    } finally {
      setReplySending(false);
    }
  };

  const confirmStatusChange = async () => {
    setStatusSaving(true);

    try {
      const next = statusTarget.status === "active" ? "inactive" : "active";
      await adminService.setUserStatus(statusTarget.id, next);

      toast.success(
        next === "active"
          ? `${statusTarget.name} can sign in again.`
          : `${statusTarget.name} has been deactivated and signed out.`
      );

      setStatusTarget(null);
      load(true);
    } catch (caught) {
      toast.error(caught.message);
    } finally {
      setStatusSaving(false);
    }
  };

  /* Each card scrolls to, and filters, the section that actually
     holds the number it's showing — so the count is never just a
     dead label. */
  const goToUsers = (status) => {
    setSearch("");
    setStatusFilter(status);
    setNewThisWeekOnly(false);
    usersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToNewThisWeek = () => {
    setSearch("");
    setStatusFilter("all");
    setNewThisWeekOnly(true);
    usersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goToProblems = () => {
    setAuditSearch("");
    setAuditProblemsOnly(true);
    auditSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const statCards = useMemo(
    () => [
      {
        icon: FiUsers,
        title: t("admin.stat.totalUsers", "Total Users"),
        value: stats?.totalUsers ?? 0,
        description: t("admin.stat.totalUsersDescription", "Registered accounts"),
        onClick: () => goToUsers("all"),
      },
      {
        icon: FiUserCheck,
        title: t("label.active", "Active"),
        value: stats?.activeUsers ?? 0,
        description: t("admin.stat.activeDescription", "Can sign in"),
        onClick: () => goToUsers("active"),
      },
      {
        icon: FiUserX,
        title: t("label.inactive", "Inactive"),
        value: stats?.inactiveUsers ?? 0,
        description: t("admin.stat.inactiveDescription", "Disabled accounts"),
        onClick: () => goToUsers("inactive"),
      },
      {
        icon: FiTrendingUp,
        title: t("admin.stat.newThisWeek", "New This Week"),
        value: stats?.newThisWeek ?? 0,
        description: t("admin.stat.newThisWeekDescription", "Recent signups"),
        onClick: goToNewThisWeek,
      },
      {
        icon: FiActivity,
        title: t("admin.stat.totalLogins", "Total Logins"),
        value: stats?.totalLogins ?? 0,
        description: t("admin.stat.totalLoginsDescription", "Successful sign-ins"),
        /* This is a per-account tally (SUM of each user's login
           count), not an audit-log count, so it lives in the Logins
           column of the users table, not the activity feed below. */
        onClick: () => goToUsers("all"),
      },
      {
        icon: FiAlertTriangle,
        title: t("admin.stat.problems", "Problems"),
        value: stats?.totalProblems ?? 0,
        description: t("admin.stat.problemsDescription", "Auth failures"),
        danger: true,
        onClick: goToProblems,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, t]
  );

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center">
            <FiShield size={22} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">
              {t("admin.title", "Admin Control Center")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(
                "admin.subtitle",
                "Accounts, authentication activity and system audit trail."
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => {
              load(true);
              loadContactMessages();
            }}
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            {t("action.refresh", "Refresh")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/staff")}
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiUserPlus size={16} />
            {t("staff.addStaff", "Add Staff")}
          </button>

          <button
            type="button"
            onClick={() => navigate("/doctors")}
            className="btn-primary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiPlus size={16} />
            {t("admin.manageDoctors", "Manage Doctors")}
          </button>
        </div>
      </motion.div>

      {/* ============ ADMIN IDENTITY ============ */}

      <div className="glass-card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center">
            <FiShield size={26} />
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-lg">{user?.name}</h2>
              <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {t("admin.administrator", "Administrator")}
              </span>
            </div>

            <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
              <FiMail size={14} />
              {user?.email}
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <FiCheckCircle />
            {t("admin.systemActive", "System Active")}
          </div>
        </div>
      </div>

      {/* ============ STATS ============ */}

      {loading ? (
        <SkeletonCards count={6} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {statCards.map((card, index) => (
            <StatCard key={card.title} {...card} delay={index * 0.04} />
          ))}
        </div>
      )}

      {/* ============ USERS ============ */}

      <section ref={usersSectionRef} className="glass-card scroll-mt-20">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold">
              {t("admin.users.title", "Registered Users")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("admin.users.subtitle", "Real accounts stored in the database.")}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {newThisWeekOnly && (
              <button
                type="button"
                onClick={() => setNewThisWeekOnly(false)}
                className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 inline-flex items-center gap-1.5 shrink-0"
              >
                <FiTrendingUp size={11} />
                {t("admin.filter.newThisWeek", "New this week")}
                <FiXCircle size={12} />
              </button>
            )}

            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={t(
                  "admin.users.searchPlaceholder",
                  "Search name, email or phone"
                )}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search users"
                className="input-field input-icon w-full sm:w-64"
              />
            </div>

            <SelectDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: t("admin.filter.allUsers", "All Users") },
                { value: "active", label: t("label.active", "Active") },
                { value: "inactive", label: t("label.inactive", "Inactive") },
              ]}
              ariaLabel="Filter users by status"
              className="w-full sm:w-36"
            />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 mb-5 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FiLock className="mt-0.5 shrink-0" />
          {t(
            "admin.passwordNotice",
            "Passwords are stored only as bcrypt hashes and are never sent to this interface."
          )}
        </div>

        {loading ? (
          <SkeletonTable rows={4} cols={6} />
        ) : visibleUsers.length === 0 ? (
          <EmptyState
            icon={FiUsers}
            title={
              newThisWeekOnly
                ? t("admin.empty.noNewSignups", "No new signups this week")
                : t("admin.empty.noUsers", "No users found")
            }
            description={
              newThisWeekOnly
                ? t(
                    "admin.empty.noNewSignupsDescription",
                    "Nobody has registered in the last 7 days."
                  )
                : t(
                    "admin.empty.noUsersDescription",
                    "No accounts match this search or filter."
                  )
            }
            compact
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {USER_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className="text-left py-3 px-3 text-xs uppercase tracking-wide text-slate-400 font-semibold"
                      >
                        {t(column.key, column.label)}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visibleUsers.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 shrink-0 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-xs">
                            {row.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{row.name}</p>
                            <p className="text-xs text-slate-400">USR-{row.id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400">
                        <p className="truncate">{row.email}</p>
                        <p className="text-xs mt-0.5">{row.phone || "—"}</p>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={`badge ${roleBadgeClass(row.role)}`}>
                          {roleLabel(row.role)}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <StatusBadge status={row.status} />
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                          <FiCalendar size={11} />
                          {formatDate(row.createdAt)}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                          <FiClock size={11} />
                          {row.lastLogin
                            ? formatDate(row.lastLogin)
                            : t("admin.never", "Never")}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <p className="font-semibold">{row.loginCount}</p>
                        {row.failedLoginAttempts > 0 && (
                          <p className="text-[11px] text-red-500">
                            {row.failedLoginAttempts} {t("admin.failed", "failed")}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        <RowActionsMenu
                          label={`Actions for ${row.name}`}
                          items={[
                            {
                              key: "view",
                              label: t("admin.viewHistory", "View history"),
                              icon: FiEye,
                              onClick: () => setDetailUser(row),
                            },
                            {
                              key: "status",
                              label:
                                row.status === "active"
                                  ? t("admin.disable", "Disable")
                                  : t("admin.enable", "Enable"),
                              icon: row.status === "active" ? FiUserX : FiUserCheck,
                              tone: row.status === "active" ? "danger" : "success",
                              onClick: () => setStatusTarget(row),
                              hidden: row.id === user?.id,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {visibleUsers.map((row) => (
                <div
                  key={row.id}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-sm">
                        {row.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{row.name}</p>
                        <p className="text-xs text-slate-400 truncate">{row.email}</p>
                      </div>
                    </div>

                    <StatusBadge status={row.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                    <Field label={t("label.role", "Role")} value={roleLabel(row.role)} />
                    <Field
                      label={t("admin.col.logins", "Logins")}
                      value={row.loginCount}
                    />
                    <Field
                      label={t("admin.col.registered", "Registered")}
                      value={formatDate(row.createdAt)}
                    />
                    <Field
                      label={t("admin.field.lastLogin", "Last login")}
                      value={
                        row.lastLogin ? formatDate(row.lastLogin) : t("admin.never", "Never")
                      }
                    />
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setDetailUser(row)}
                      className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {t("admin.viewHistory", "View history")}
                    </button>

                    {row.id !== user?.id && (
                      <button
                        type="button"
                        onClick={() => setStatusTarget(row)}
                        className={
                          row.status === "active"
                            ? "flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
                            : "flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-300"
                        }
                      >
                        {row.status === "active"
                          ? t("admin.disable", "Disable")
                          : t("admin.enable", "Enable")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ============ AUDIT ============ */}

      <section ref={auditSectionRef} className="glass-card scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FiActivity className="text-brand-600 dark:text-brand-400" />
              {t("admin.audit.title", "Authentication & Audit Log")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t(
                "admin.audit.subtitle",
                "Every sign-in, failure and administrative action."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {auditProblemsOnly && (
              <button
                type="button"
                onClick={() => setAuditProblemsOnly(false)}
                className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 inline-flex items-center gap-1.5 shrink-0"
              >
                <FiAlertTriangle size={11} />
                {t("admin.audit.problemsOnly", "Problems only")}
                <FiXCircle size={12} />
              </button>
            )}

            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={t("admin.audit.searchPlaceholder", "Search activity")}
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                aria-label="Search audit log"
                className="input-field input-icon w-full md:w-64"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonList count={4} />
        ) : visibleAudit.length === 0 ? (
          <EmptyState
            icon={FiActivity}
            title={
              auditProblemsOnly
                ? t("admin.audit.empty.noProblems", "No problems found")
                : t("admin.audit.empty.noActivity", "No activity recorded")
            }
            description={
              auditProblemsOnly
                ? t(
                    "admin.audit.empty.noProblemsDescription",
                    "No failed sign-ins or access denials in the loaded activity."
                  )
                : t(
                    "admin.audit.empty.noActivityDescription",
                    "Sign-ins and administrative actions will be logged here."
                  )
            }
            compact
          />
        ) : (
          <div className="space-y-2.5 max-h-[32rem] overflow-y-auto pr-1">
            {visibleAudit.map((entry, index) => {
              const tone = auditTone(entry.action);

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.015, 0.3), duration: 0.2 }}
                  className={`rounded-xl border p-3.5 ${AUDIT_TONES[tone]}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                        tone === "problem"
                          ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                          : tone === "admin"
                          ? "bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
                          : "bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400"
                      }`}
                    >
                      {tone === "problem" ? (
                        <FiAlertTriangle size={15} />
                      ) : tone === "admin" ? (
                        <FiShield size={15} />
                      ) : (
                        <FiCheckCircle size={15} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1">
                        <p className="text-sm font-medium">
                          {entry.details || prettyAction(entry.action)}
                        </p>

                        <span className="text-xs text-slate-400 inline-flex items-center gap-1 shrink-0">
                          <FiClock size={11} />
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="badge bg-white/70 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                          {prettyAction(entry.action)}
                        </span>
                        {entry.actorEmail && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <FiMail size={11} />
                            {entry.actorEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ CONTACT MESSAGES ============ */}

      <section className="glass-card scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FiMessageSquare className="text-brand-600 dark:text-brand-400" />
              {t("admin.contact.title", "Contact Messages")}
              {contactStats.unread > 0 && (
                <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  {contactStats.unread} {t("admin.contact.unread", "unread")}
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {t("admin.contact.subtitle", "Submissions from the public contact form.")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {["All", "unread", "read"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setContactStatusFilter(option)}
                className={`badge shrink-0 capitalize transition ${
                  contactStatusFilter === option
                    ? "bg-brand-600 text-white"
                    : "bg-white/70 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {option === "All"
                  ? t("admin.contact.filter.all", "All")
                  : option === "unread"
                  ? t("admin.contact.filter.unread", "unread")
                  : t("admin.contact.filter.read", "read")}
              </button>
            ))}
          </div>
        </div>

        {contactLoading ? (
          <SkeletonList count={3} />
        ) : contactMessages.length === 0 ? (
          <EmptyState
            icon={FiMessageSquare}
            title={t("admin.contact.empty.title", "No messages")}
            description={t(
              "admin.contact.empty.description",
              "Messages sent from the public contact form will appear here."
            )}
            compact
          />
        ) : (
          <div className="space-y-2.5 max-h-[32rem] overflow-y-auto pr-1">
            {contactMessages.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.015, 0.3), duration: 0.2 }}
                className={`rounded-xl border p-3.5 ${
                  row.status === "unread"
                    ? "border-brand-200 bg-brand-50/60 dark:border-brand-900/60 dark:bg-brand-950/20"
                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
                      row.status === "unread"
                        ? "bg-brand-100 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <FiMail size={15} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-1">
                      <p className="text-sm font-semibold truncate">
                        {row.name}
                        <span className="font-normal text-slate-400"> — {row.email}</span>
                      </p>

                      <span className="text-xs text-slate-400 inline-flex items-center gap-1 shrink-0">
                        <FiClock size={11} />
                        {formatDate(row.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-wrap">
                      {row.message}
                    </p>

                    {row.replyMessage && (
                      <div className="mt-2.5 pl-3 border-l-2 border-brand-200 dark:border-brand-900/60">
                        <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 inline-flex items-center gap-1">
                          <FiCornerUpLeft size={11} />
                          {t("admin.contact.yourReply", "Your reply")} —{" "}
                          {formatDate(row.repliedAt)}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                          {row.replyMessage}
                        </p>
                      </div>
                    )}
                  </div>

                  <RowActionsMenu
                    label={`Actions for message from ${row.name}`}
                    items={[
                      {
                        key: "reply",
                        label: row.replyMessage
                          ? t("admin.contact.replyAgain", "Reply again")
                          : t("admin.contact.reply", "Reply"),
                        icon: FiCornerUpLeft,
                        onClick: () => openReply(row),
                      },
                      {
                        key: "read",
                        label: t("admin.contact.markRead", "Mark read"),
                        icon: FiCheckCircle,
                        onClick: () => markContactRead(row),
                        hidden: row.status === "read",
                      },
                      {
                        key: "delete",
                        label: t("action.delete", "Delete"),
                        icon: FiTrash2,
                        tone: "danger",
                        onClick: () => setDeleteContactTarget(row),
                      },
                    ]}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ============ DIALOGS ============ */}

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onCancel={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
        loading={statusSaving}
        tone={statusTarget?.status === "active" ? "danger" : "brand"}
        title={
          statusTarget?.status === "active"
            ? t("admin.confirm.deactivateTitle", "Deactivate account")
            : t("admin.confirm.reactivateTitle", "Reactivate account")
        }
        confirmLabel={
          statusTarget?.status === "active"
            ? t("admin.confirm.deactivate", "Deactivate")
            : t("admin.confirm.reactivate", "Reactivate")
        }
        message={
          statusTarget
            ? statusTarget.status === "active"
              ? `${statusTarget.name} ${t(
                  "admin.confirm.deactivateMessage",
                  "will be signed out immediately and blocked from signing in until reactivated."
                )}`
              : `${statusTarget.name} ${t(
                  "admin.confirm.reactivateMessage",
                  "will be able to sign in again."
                )}`
            : ""
        }
      />

      <ConfirmDialog
        open={Boolean(deleteContactTarget)}
        onCancel={() => setDeleteContactTarget(null)}
        onConfirm={confirmDeleteContact}
        loading={contactDeleting}
        tone="danger"
        title={t("admin.confirm.deleteMessageTitle", "Delete message")}
        confirmLabel={t("action.delete", "Delete")}
        message={
          deleteContactTarget
            ? `Delete the message from ${deleteContactTarget.name}? This cannot be undone.`
            : ""
        }
      />

      <Modal
        open={Boolean(replyTarget)}
        onClose={() => !replySending && setReplyTarget(null)}
        title={t("admin.contact.replyTitle", "Reply to message")}
        description={replyTarget ? `Sent by email to ${replyTarget.email}.` : ""}
        size="sm"
      >
        {replyTarget && (
          <form onSubmit={submitReply} className="space-y-4" noValidate>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-500 dark:text-slate-400 max-h-28 overflow-y-auto whitespace-pre-wrap">
              {replyTarget.message}
            </div>

            <div>
              <label htmlFor="contact-reply" className="block text-sm font-medium mb-1.5">
                {t("admin.contact.yourReply", "Your reply")}
              </label>
              <textarea
                id="contact-reply"
                rows={5}
                value={replyText}
                onChange={(event) => {
                  setReplyText(event.target.value);
                  setReplyError("");
                }}
                placeholder={`Hi ${replyTarget.name}, ...`}
                className="input-field resize-none"
                autoFocus
                required
              />
            </div>

            {replyError && <Alert tone="error">{replyError}</Alert>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                disabled={replySending}
                className="btn-secondary flex-1 disabled:opacity-60"
              >
                {t("action.cancel", "Cancel")}
              </button>
              <button
                type="submit"
                disabled={replySending}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {replySending && <Spinner size={14} />}
                {replySending
                  ? t("admin.contact.sending", "Sending...")
                  : t("admin.contact.sendReply", "Send Reply")}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <UserDetailModal user={detailUser} onClose={() => setDetailUser(null)} />
    </div>
  );
}

/* ================================================================== */

function StatCard({ icon: Icon, title, value, description, danger = false, delay = 0, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28 }}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={`glass-card text-left w-full ${
        onClick
          ? "cursor-pointer transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight break-words">{title}</p>
          <p
            className={`text-2xl font-bold mt-1.5 truncate ${
              danger ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-white"
            }`}
          >
            {value}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 leading-tight break-words">{description}</p>
        </div>

        <div
          className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${
            danger
              ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              : "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"
          }`}
        >
          <Icon size={18} />
        </div>
      </div>
    </motion.button>
  );
}

function StatusBadge({ status }) {
  const t = useT();

  return status === "active" ? (
    <span className="badge bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 inline-flex items-center gap-1">
      <FiCheckCircle size={11} />
      {t("label.active", "Active")}
    </span>
  ) : (
    <span className="badge bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 inline-flex items-center gap-1">
      <FiXCircle size={11} />
      {t("label.inactive", "Inactive")}
    </span>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400">{label}</p>
      <p className="font-medium mt-0.5 truncate capitalize">{value}</p>
    </div>
  );
}

function UserDetailModal({ user, onClose }) {
  const t = useT();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setHistory(null);
      return;
    }

    let active = true;
    setLoading(true);

    adminService
      .userHistory(user.id)
      .then((data) => active && setHistory(data))
      .catch(() => active && setHistory(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={user?.name || t("admin.detail.userFallback", "User")}
      description={user?.email}
      size="lg"
    >
      {loading ? (
        <div className="flex items-center gap-3 py-10 justify-center text-sm text-slate-400">
          <Spinner size={18} />
          {t("admin.detail.loadingHistory", "Loading history...")}
        </div>
      ) : !history ? (
        <p className="text-sm text-slate-400 py-8 text-center">
          {t("admin.detail.loadFailed", "Could not load this user's history.")}
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label={t("label.status", "Status")} value={history.user.status} />
            <MiniStat
              label={t("admin.col.logins", "Logins")}
              value={history.user.loginCount}
            />
            <MiniStat
              label={t("nav.appointments", "Appointments")}
              value={history.appointments.length}
            />
            <MiniStat
              label={t("nav.reports", "Reports")}
              value={history.reports.length}
            />
          </div>

          <section>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <FiCalendar size={14} className="text-brand-600 dark:text-brand-400" />
              {t("admin.detail.appointmentHistory", "Appointment history")}
            </h3>

            {history.appointments.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/60">
                {t("admin.detail.noAppointments", "No appointments booked.")}
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {history.appointments.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.doctorName}</p>
                      <p className="text-xs text-slate-400">
                        {row.department} · {row.date} {row.time}
                      </p>
                    </div>
                    <span className="badge bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 shrink-0 capitalize">
                      {row.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <FiFileText size={14} className="text-brand-600 dark:text-brand-400" />
              {t("admin.detail.reportHistory", "Report history")}
            </h3>

            {history.reports.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center rounded-xl bg-slate-50 dark:bg-slate-800/60">
                {t("admin.detail.noReports", "No reports issued.")}
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {history.reports.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{row.title}</p>
                      <p className="text-xs text-slate-400">
                        {row.type} · {row.reportDate}
                      </p>
                    </div>
                    <span className="badge bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 shrink-0">
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="font-bold mt-0.5 capitalize">{value}</p>
    </div>
  );
}

function prettyAction(action) {
  return String(action || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return "—";

  const stamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(stamp);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
