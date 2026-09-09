import React, { useCallback, useEffect, useState } from "react";
import { FiClock, FiPlus, FiTrash2, FiSave, FiCopy } from "react-icons/fi";

import doctorPortalService from "../services/doctorPortalService.js";
import { useToast } from "../context/ToastContext.jsx";
import { Alert, Spinner } from "./ui/States.jsx";
import { Skeleton } from "./ui/Skeleton.jsx";
import TimePicker from "./ui/TimePicker.jsx";

/* ==================================================================
   WEEKLY CLINIC HOURS

   The timetable patients can book against, edited a day at a time.
   Each day holds any number of shift windows (a morning clinic and an
   evening one, say), which is why this is a list per weekday rather
   than a single from/to pair.

   The whole week is saved at once — the API replaces the timetable
   rather than patching individual rows, so a partial save could
   silently drop the days that were not sent.
================================================================== */

const DAYS = [
  { index: 1, label: "Monday", short: "Mon" },
  { index: 2, label: "Tuesday", short: "Tue" },
  { index: 3, label: "Wednesday", short: "Wed" },
  { index: 4, label: "Thursday", short: "Thu" },
  { index: 5, label: "Friday", short: "Fri" },
  { index: 6, label: "Saturday", short: "Sat" },
  { index: 0, label: "Sunday", short: "Sun" },
];

const DEFAULT_WINDOW = { startTime: "09:00", endTime: "17:00" };

export default function WeeklyHours() {
  const toast = useToast();

  const [byDay, setByDay] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await doctorPortalService.schedule();

      const grouped = {};

      for (const row of data.schedule || []) {
        const day = Number(row.weekday);
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push({ startTime: row.start_time, endTime: row.end_time });
      }

      setByDay(grouped);
    } catch (caught) {
      setError(caught.message || "Could not load your hours.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addWindow = (day) => {
    setByDay((current) => ({
      ...current,
      [day]: [...(current[day] || []), { ...DEFAULT_WINDOW }],
    }));
  };

  const removeWindow = (day, index) => {
    setByDay((current) => {
      const next = [...(current[day] || [])];
      next.splice(index, 1);

      if (next.length === 0) {
        const { [day]: _dropped, ...rest } = current;
        return rest;
      }

      return { ...current, [day]: next };
    });
  };

  const setWindow = (day, index, field, value) => {
    setByDay((current) => {
      const next = [...(current[day] || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...current, [day]: next };
    });
  };

  /* Setting one day up and stamping it across the week is the common
     case; typing the same two times seven times over is not. */
  const copyToWeekdays = (day) => {
    const source = byDay[day];
    if (!source?.length) return;

    setByDay((current) => {
      const next = { ...current };
      for (const weekday of [1, 2, 3, 4, 5]) {
        next[weekday] = source.map((window) => ({ ...window }));
      }
      return next;
    });

    toast.success("Copied to Monday–Friday.");
  };

  const save = async () => {
    /* Validated here as well as on the server so the doctor sees which
       row is wrong instead of a single message about the whole week. */
    for (const [day, windows] of Object.entries(byDay)) {
      for (const window of windows) {
        if (!window.startTime || !window.endTime) {
          setError(`${DAYS.find((d) => d.index === Number(day))?.label}: fill both times.`);
          return;
        }

        if (window.endTime <= window.startTime) {
          setError(
            `${DAYS.find((d) => d.index === Number(day))?.label}: a shift must end after it starts.`
          );
          return;
        }
      }
    }

    setSaving(true);
    setError("");

    const flat = Object.entries(byDay).flatMap(([day, windows]) =>
      windows.map((window) => ({
        weekday: Number(day),
        startTime: window.startTime,
        endTime: window.endTime,
      }))
    );

    try {
      await doctorPortalService.saveSchedule(flat);
      toast.success("Weekly hours saved.");
      load();
    } catch (caught) {
      setError(caught.message || "Could not save your hours.");
    } finally {
      setSaving(false);
    }
  };

  const totalWindows = Object.values(byDay).reduce((sum, list) => sum + list.length, 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Patients can only book inside these windows. A day with no window is a day
        off. {totalWindows} shift{totalWindows === 1 ? "" : "s"} set.
      </p>

      <div className="space-y-3">
        {DAYS.map((day) => {
          const windows = byDay[day.index] || [];
          const off = windows.length === 0;

          return (
            <div
              key={day.index}
              className={`rounded-xl border p-3.5 transition ${
                off
                  ? "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40"
                  : "border-brand-200 dark:border-brand-900/60 bg-brand-50/30 dark:bg-brand-950/10"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm">{day.label}</span>
                  {off && <span className="text-xs text-slate-400">Day off</span>}
                </div>

                <div className="flex items-center gap-1.5">
                  {windows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => copyToWeekdays(day.index)}
                      aria-label={`Copy ${day.label} to weekdays`}
                      title="Copy to Mon–Fri"
                      className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-white dark:hover:bg-slate-800 transition inline-flex items-center gap-1"
                    >
                      <FiCopy size={12} />
                      Mon–Fri
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => addWindow(day.index)}
                    aria-label={`Add a shift on ${day.label}`}
                    className="text-xs px-2 py-1 rounded-lg text-brand-600 dark:text-brand-400 hover:bg-white dark:hover:bg-slate-800 transition inline-flex items-center gap-1"
                  >
                    <FiPlus size={12} />
                    Add shift
                  </button>
                </div>
              </div>

              {windows.length > 0 && (
                <div className="space-y-2">
                  {windows.map((window, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <TimePicker
                        value={window.startTime}
                        onChange={(value) => setWindow(day.index, index, "startTime", value)}
                        ariaLabel={`${day.label} shift ${index + 1} start`}
                        placeholder="Start"
                        className="input-field input-icon flex-1 min-w-[130px]"
                      />

                      <span className="text-slate-400 text-sm shrink-0">to</span>

                      <TimePicker
                        value={window.endTime}
                        onChange={(value) => setWindow(day.index, index, "endTime", value)}
                        ariaLabel={`${day.label} shift ${index + 1} end`}
                        placeholder="End"
                        className="input-field input-icon flex-1 min-w-[130px]"
                      />

                      <button
                        type="button"
                        onClick={() => removeWindow(day.index, index)}
                        aria-label={`Remove ${day.label} shift ${index + 1}`}
                        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
      >
        {saving ? <Spinner size={14} /> : <FiSave size={15} />}
        {saving ? "Saving..." : "Save Weekly Hours"}
      </button>
    </div>
  );
}
