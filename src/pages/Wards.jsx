import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  FiGrid,
  FiPlus,
  FiRefreshCw,
  FiUser,
  FiUserPlus,
  FiLogOut,
  FiTool,
  FiTrash2,
  FiEdit2,
  FiLayers,
} from "react-icons/fi";

import { wardService } from "../services/clinicalService.js";
import { patientService } from "../services/adminService.js";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../context/ToastContext.jsx";
import { useT } from "../context/LanguageContext.jsx";
import { Modal, ConfirmDialog } from "../components/ui/Modal.jsx";
import { Alert, EmptyState, ErrorState, Spinner } from "../components/ui/States.jsx";
import { SkeletonCards } from "../components/ui/Skeleton.jsx";
import SelectDropdown from "../components/ui/SelectDropdown.jsx";
import { padRefresh } from "../utils/timing.js";
import { ROLES } from "../constants/roles.js";

/* ==================================================================
   WARD BOARD

   Which beds are free right now, and who is in the rest. Occupancy is
   read straight off the bed rows, so the board is never a
   reconstruction of history that can drift out of date.
================================================================== */

const WARD_KINDS = [
  { value: "general", key: "wards.kindGeneral", label: "General" },
  { value: "icu", key: "wards.kindIcu", label: "ICU" },
  { value: "private", key: "wards.kindPrivate", label: "Private" },
  { value: "maternity", key: "wards.kindMaternity", label: "Maternity" },
  { value: "pediatric", key: "wards.kindPediatric", label: "Pediatric" },
  { value: "emergency", key: "wards.kindEmergency", label: "Emergency" },
];

const BED_STATUS = [
  { value: "available", label: "Available" },
  { value: "reserved", label: "Reserved" },
  { value: "maintenance", label: "Maintenance" },
];

/* The bed status enum doubles as a UI label, so each value carries the
   key it should be rendered through. */
const BED_STATUS_LABELS = {
  available: ["wards.available", "Available"],
  occupied: ["wards.occupied", "Occupied"],
  reserved: ["wards.reserved", "Reserved"],
  maintenance: ["wards.maintenance", "Maintenance"],
};

const STATUS_STYLES = {
  available: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  occupied: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  reserved: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  maintenance: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const EMPTY_WARD = { name: "", kind: "general", floor: "", notes: "" };

function wardKindLabel(t, kind) {
  const found = WARD_KINDS.find((item) => item.value === kind);
  return found ? t(found.key, found.label) : kind;
}

function bedStatusLabel(t, status) {
  const found = BED_STATUS_LABELS[status];
  return found ? t(found[0], found[1]) : status;
}

export default function Wards() {
  const { user } = useAuth();
  const toast = useToast();
  const t = useT();

  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.NURSE;
  const canDelete = user?.role === ROLES.ADMIN;

  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [stats, setStats] = useState(null);
  const [patients, setPatients] = useState([]);

  const [selectedWard, setSelectedWard] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [wardModal, setWardModal] = useState(null);
  const [wardForm, setWardForm] = useState(EMPTY_WARD);
  const [bedModal, setBedModal] = useState(false);
  const [bedForm, setBedForm] = useState({ prefix: "Bed", from: "1", to: "10" });
  const [assignFor, setAssignFor] = useState(null);
  const [assignPatient, setAssignPatient] = useState("");
  const [confirm, setConfirm] = useState(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    const startedAt = Date.now();
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [wardData, bedData] = await Promise.all([
        wardService.list(),
        wardService.beds(),
      ]);

      setWards(wardData.wards);
      setStats(wardData.stats);
      setBeds(bedData.beds);
    } catch (caught) {
      setError(caught);
    } finally {
      await padRefresh(isRefresh, startedAt);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Only fetched when a bed is actually being assigned — the board
     itself has no use for the full patient list. */
  const openAssign = async (bed) => {
    setAssignFor(bed);
    setAssignPatient("");

    try {
      const data = await patientService.list({ limit: 200 });
      setPatients(data.patients || []);
    } catch {
      setPatients([]);
    }
  };

  const visibleBeds = useMemo(
    () => (selectedWard ? beds.filter((bed) => String(bed.wardId) === selectedWard) : beds),
    [beds, selectedWard]
  );

  const bedsByWard = useMemo(() => {
    const map = new Map();
    for (const bed of visibleBeds) {
      if (!map.has(bed.wardId)) map.set(bed.wardId, []);
      map.get(bed.wardId).push(bed);
    }
    return map;
  }, [visibleBeds]);

  const saveWard = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      if (wardModal === "new") await wardService.create(wardForm);
      else await wardService.update(wardModal.id, wardForm);

      toast.success(wardModal === "new" ? "Ward created." : "Ward updated.");
      setWardModal(null);
      load(true);
    } catch (caught) {
      setFormError(caught.message || "Could not save the ward.");
    } finally {
      setSaving(false);
    }
  };

  const saveBeds = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const result = await wardService.addBed({
        wardId: Number(bedModal),
        prefix: bedForm.prefix,
        from: Number(bedForm.from),
        to: Number(bedForm.to),
      });

      toast.success(
        `${result.added} bed${result.added === 1 ? "" : "s"} added${
          result.skipped ? ` · ${result.skipped} already existed` : ""
        }.`
      );

      setBedModal(false);
      load(true);
    } catch (caught) {
      setFormError(caught.message || "Could not add beds.");
    } finally {
      setSaving(false);
    }
  };

  const assign = async (event) => {
    event.preventDefault();

    if (!assignPatient) {
      setFormError("Choose a patient.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      await wardService.assign(assignFor.id, Number(assignPatient));
      toast.success("Bed assigned.");
      setAssignFor(null);
      load(true);
    } catch (caught) {
      setFormError(caught.message || "Could not assign that bed.");
    } finally {
      setSaving(false);
    }
  };

  const release = async (bed) => {
    try {
      await wardService.release(bed.id);
      toast.success(`${bed.label} released.`);
      load(true);
    } catch (caught) {
      toast.error(caught.message || "Could not release that bed.");
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;

    try {
      await confirm.action();
      toast.success(confirm.done);
      load(true);
    } catch (caught) {
      toast.error(caught.message || "That did not work.");
    } finally {
      setConfirm(null);
    }
  };

  if (error) {
    return (
      <div className="glass-card">
        <ErrorState error={error} onRetry={() => load()} />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ============ HEADER ============ */}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="glass p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">{t("wards.title", "Wards & Beds")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {stats
              ? t("wards.summary", "{free} of {total} beds free across {wards} wards")
                  .replace("{free}", stats.available)
                  .replace("{total}", stats.totalBeds)
                  .replace("{wards}", stats.wards)
              : t("wards.subtitle", "Bed occupancy across the hospital.")}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <SelectDropdown
            value={selectedWard}
            onChange={setSelectedWard}
            options={[
              { value: "", label: t("wards.allWards", "All wards") },
              ...wards.map((ward) => ({ value: String(ward.id), label: ward.name })),
            ]}
            ariaLabel="Filter by ward"
            className="w-full sm:w-44"
          />

          <button
            type="button"
            onClick={() => load(true)}
            aria-label="Refresh ward board"
            className="btn-secondary text-sm inline-flex items-center justify-center gap-2"
          >
            <FiRefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setWardForm(EMPTY_WARD);
                setFormError("");
                setWardModal("new");
              }}
              className="btn-primary text-sm inline-flex items-center justify-center gap-2"
            >
              <FiPlus size={16} />
              {t("wards.addWard", "Add Ward")}
            </button>
          )}
        </div>
      </motion.div>

      {/* ============ STATS ============ */}

      {loading ? (
        <SkeletonCards count={5} />
      ) : (
        stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatTile label={t("wards.totalBeds", "Total beds")} value={stats.totalBeds} icon={FiGrid} />
            <StatTile
              label={t("wards.available", "Available")}
              value={stats.available}
              icon={FiLayers}
              tone="emerald"
            />
            <StatTile
              label={t("wards.occupied", "Occupied")}
              value={stats.occupied}
              icon={FiUser}
              tone="rose"
            />
            <StatTile
              label={t("wards.reserved", "Reserved")}
              value={stats.reserved}
              icon={FiUserPlus}
              tone="amber"
            />
            <StatTile
              label={t("wards.occupancy", "Occupancy")}
              value={`${stats.occupancyRate}%`}
              icon={FiGrid}
            />
          </div>
        )
      )}

      {/* ============ WARDS ============ */}

      {loading ? (
        <SkeletonCards count={3} />
      ) : wards.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={FiGrid}
            title={t("wards.noWards", "No wards yet")}
            description={
              canEdit
                ? t("wards.noWardsEditor", "Create a ward, then add the beds it contains.")
                : t("wards.noWardsViewer", "No wards have been configured yet.")
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {wards
            .filter((ward) => !selectedWard || String(ward.id) === selectedWard)
            .map((ward) => (
              <section key={ward.id} className="glass-card">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-lg truncate">{ward.name}</h2>
                      <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                        {wardKindLabel(t, ward.kind)}
                      </span>
                      {ward.floor && (
                        <span className="text-xs text-slate-400">
                          {t("wards.floor", "Floor")} {ward.floor}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {ward.availableBeds} {t("wards.free", "free")} · {ward.occupiedBeds}{" "}
                      {t("wards.occupiedLower", "occupied")} · {ward.totalBeds}{" "}
                      {t("wards.total", "total")}
                      {ward.departmentName ? ` · ${ward.departmentName}` : ""}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setBedForm({ prefix: "Bed", from: "1", to: "10" });
                          setFormError("");
                          setBedModal(ward.id);
                        }}
                        className="btn-secondary text-xs inline-flex items-center gap-1.5"
                      >
                        <FiPlus size={13} />
                        {t("wards.addBeds", "Add beds")}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setWardForm({
                            name: ward.name,
                            kind: ward.kind,
                            floor: ward.floor || "",
                            notes: ward.notes || "",
                          });
                          setFormError("");
                          setWardModal(ward);
                        }}
                        className="btn-secondary text-xs inline-flex items-center gap-1.5"
                      >
                        <FiEdit2 size={13} />
                        {t("action.edit", "Edit")}
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirm({
                              title: t("wards.deleteWardTitle", "Delete {name}?").replace(
                                "{name}",
                                ward.name
                              ),
                              message: t(
                                "wards.deleteWardMessage",
                                "The ward and all of its beds will be removed. Occupied wards cannot be deleted."
                              ),
                              action: () => wardService.remove(ward.id),
                              done: "Ward deleted.",
                            })
                          }
                          aria-label={`Delete ${ward.name}`}
                          className="btn-secondary text-xs !text-red-600 inline-flex items-center gap-1.5"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {(bedsByWard.get(ward.id) || []).length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {t("wards.noBeds", "No beds in this ward yet.")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {(bedsByWard.get(ward.id) || []).map((bed) => (
                      <BedCard
                        key={bed.id}
                        bed={bed}
                        canEdit={canEdit}
                        onAssign={() => openAssign(bed)}
                        onRelease={() => release(bed)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
        </div>
      )}

      {/* ============ WARD MODAL ============ */}

      <Modal
        open={Boolean(wardModal)}
        onClose={() => setWardModal(null)}
        title={
          wardModal === "new"
            ? t("wards.addWard", "Add Ward")
            : t("wards.editWard", "Edit Ward")
        }
      >
        <form onSubmit={saveWard} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label={t("wards.wardName", "Ward name")} required>
            <input
              value={wardForm.name}
              onChange={(event) => setWardForm({ ...wardForm, name: event.target.value })}
              placeholder={t("wards.wardNamePlaceholder", "General Ward A")}
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("wards.type", "Type")}>
              <SelectDropdown
                value={wardForm.kind}
                onChange={(value) => setWardForm({ ...wardForm, kind: value })}
                options={WARD_KINDS.map((item) => ({
                  value: item.value,
                  label: t(item.key, item.label),
                }))}
                ariaLabel="Ward type"
                className="w-full"
              />
            </Field>

            <Field label={t("wards.floor", "Floor")}>
              <input
                value={wardForm.floor}
                onChange={(event) => setWardForm({ ...wardForm, floor: event.target.value })}
                placeholder="1st"
                className="input-field"
              />
            </Field>
          </div>

          <Field label={t("wards.notes", "Notes")}>
            <textarea
              rows={2}
              value={wardForm.notes}
              onChange={(event) => setWardForm({ ...wardForm, notes: event.target.value })}
              className="input-field resize-none"
            />
          </Field>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setWardModal(null)}
              className="btn-secondary flex-1"
            >
              {t("action.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving ? t("action.saving", "Saving...") : t("wards.saveWard", "Save Ward")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ ADD BEDS MODAL ============ */}

      <Modal
        open={Boolean(bedModal)}
        onClose={() => setBedModal(false)}
        title={t("wards.addBedsTitle", "Add Beds")}
      >
        <form onSubmit={saveBeds} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(
              "wards.addBedsHint",
              "Beds are numbered from a prefix and a range. Labels that already exist are skipped."
            )}
          </p>

          <Field label={t("wards.labelPrefix", "Label prefix")}>
            <input
              value={bedForm.prefix}
              onChange={(event) => setBedForm({ ...bedForm, prefix: event.target.value })}
              placeholder="Bed"
              className="input-field"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("wards.from", "From")}>
              <input
                type="number"
                min="1"
                value={bedForm.from}
                onChange={(event) => setBedForm({ ...bedForm, from: event.target.value })}
                className="input-field"
              />
            </Field>

            <Field label={t("wards.to", "To")}>
              <input
                type="number"
                min="1"
                value={bedForm.to}
                onChange={(event) => setBedForm({ ...bedForm, to: event.target.value })}
                className="input-field"
              />
            </Field>
          </div>

          <p className="text-xs text-slate-400">
            {t("wards.creates", "Creates")} {bedForm.prefix || "Bed"} {bedForm.from} …{" "}
            {bedForm.prefix || "Bed"} {bedForm.to}
          </p>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={() => setBedModal(false)} className="btn-secondary flex-1">
              {t("action.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving ? t("wards.adding", "Adding...") : t("wards.addBedsTitle", "Add Beds")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ ASSIGN MODAL ============ */}

      <Modal
        open={Boolean(assignFor)}
        onClose={() => setAssignFor(null)}
        title={`${t("wards.assign", "Assign")} ${assignFor?.label || t("wards.bed", "bed")}`}
        description={assignFor?.wardName}
      >
        <form onSubmit={assign} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}

          <Field label={t("label.patient", "Patient")} required>
            <SelectDropdown
              value={assignPatient}
              onChange={setAssignPatient}
              options={[
                {
                  value: "",
                  label: patients.length
                    ? t("wards.selectPatient", "Select a patient")
                    : t("wards.loadingPatients", "Loading patients..."),
                },
                ...patients.map((patient) => ({
                  value: String(patient.id),
                  label: `${patient.name}${patient.room ? ` · Room ${patient.room}` : ""}`,
                })),
              ]}
              ariaLabel="Patient"
              className="w-full"
            />
          </Field>

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button type="button" onClick={() => setAssignFor(null)} className="btn-secondary flex-1">
              {t("action.cancel", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Spinner size={14} />}
              {saving ? t("wards.assigning", "Assigning...") : t("wards.assignBed", "Assign Bed")}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={t("action.delete", "Delete")}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}

function BedCard({ bed, canEdit, onAssign, onRelease }) {
  const t = useT();
  const occupied = bed.status === "occupied";

  return (
    <div
      className={`rounded-xl border p-3 transition ${
        occupied
          ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20"
          : bed.status === "maintenance"
          ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40"
          : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm truncate">{bed.label}</span>
        <span className={`badge shrink-0 !text-[10px] ${STATUS_STYLES[bed.status]}`}>
          {bedStatusLabel(t, bed.status)}
        </span>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 truncate min-h-[16px]">
        {occupied ? bed.patientName || t("wards.occupied", "Occupied") : " "}
      </p>

      {canEdit && (
        <div className="mt-2.5">
          {occupied ? (
            <button
              type="button"
              onClick={onRelease}
              className="w-full text-xs py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition inline-flex items-center justify-center gap-1.5"
            >
              <FiLogOut size={12} />
              {t("wards.release", "Release")}
            </button>
          ) : bed.status === "maintenance" ? (
            <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
              <FiTool size={11} />
              {t("wards.outOfService", "Out of service")}
            </p>
          ) : (
            <button
              type="button"
              onClick={onAssign}
              className="w-full text-xs py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition inline-flex items-center justify-center gap-1.5"
            >
              <FiUserPlus size={12} />
              {t("wards.assign", "Assign")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone }) {
  const tones = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose: "text-rose-600 dark:text-rose-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="glass-card !p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <Icon size={15} className="text-slate-400 shrink-0" />
      </div>
      <p className={`text-2xl font-bold mt-1 ${tones[tone] || ""}`}>{value}</p>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
