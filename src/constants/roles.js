/* ==================================================================
   ROLES — one definition the whole client agrees on.

   These strings must match server/db.js:
     users.role CHECK (role IN ('user','admin','doctor'))

   'user' IS the patient role. The product calls them patients, the
   schema calls them users, and mixing the two vocabularies is how a
   comparison against a role that does not exist (`role === "patient"`,
   silently always false) gets written. Import from here instead of
   typing the literal.

   Patient-ness is expressed POSITIVELY (role === USER) rather than as
   "not admin and not doctor". A negation quietly grants the full
   patient portal to any role added later — nurse, receptionist,
   pending — and to a user object whose role failed to load.
================================================================== */

export const ROLES = {
  ADMIN: "admin",
  DOCTOR: "doctor",
  PATIENT: "user",
  NURSE: "nurse",
  RECEPTIONIST: "receptionist",
};

export const ALL_ROLES = [
  ROLES.ADMIN,
  ROLES.DOCTOR,
  ROLES.PATIENT,
  ROLES.NURSE,
  ROLES.RECEPTIONIST,
];

/* Hospital employees, as opposed to patients. Used wherever a screen
   is "staff-facing" without caring which kind of staff. */
export const STAFF_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.NURSE, ROLES.RECEPTIONIST];

/** Human label for a role, for badges and headings. */
export function roleLabel(role) {
  if (role === ROLES.ADMIN) return "Administrator";
  if (role === ROLES.DOCTOR) return "Doctor";
  if (role === ROLES.PATIENT) return "Patient";
  if (role === ROLES.NURSE) return "Nurse";
  if (role === ROLES.RECEPTIONIST) return "Receptionist";
  return "Unknown";
}

/** The home each role should land on after signing in. */
export function homePathFor(role) {
  if (role === ROLES.ADMIN) return "/admin";
  if (role === ROLES.DOCTOR) return "/doctor/dashboard";
  if (role === ROLES.PATIENT) return "/dashboard";
  /* Nurses live on the ward board; receptionists on the front desk. */
  if (role === ROLES.NURSE) return "/wards";
  if (role === ROLES.RECEPTIONIST) return "/appointments";
  /* An unrecognised role gets no portal at all — never a default one. */
  return "/access-denied";
}
