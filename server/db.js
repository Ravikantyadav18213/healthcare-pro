import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { config } from "./config/env.js";

/* ==================================================================
   CONNECTION

   The database file is created on first run and is NEVER dropped or
   truncated during normal startup. Every statement below is
   idempotent (IF NOT EXISTS), so restarting the server preserves
   all existing rows.
================================================================== */

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new Database(config.dbFile);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* ==================================================================
   SCHEMA
================================================================== */

db.exec(`
CREATE TABLE IF NOT EXISTS schema_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  email                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone                 TEXT,
  password_hash         TEXT    NOT NULL,
  role                  TEXT    NOT NULL DEFAULT 'user'
                          CHECK (role IN ('user','admin')),
  status                TEXT    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive')),
  date_of_birth         TEXT,
  gender                TEXT,
  avatar_color          TEXT,
  last_login            TEXT,
  login_count           INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS sessions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT    NOT NULL UNIQUE,
  user_agent         TEXT,
  ip                 TEXT,
  expires_at         TEXT    NOT NULL,
  revoked_at         TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS departments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  description TEXT,
  head_doctor TEXT,
  status      TEXT    NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS doctors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  email            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone            TEXT,
  specialization   TEXT    NOT NULL,
  department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  qualification    TEXT,
  experience_years INTEGER NOT NULL DEFAULT 0,
  consultation_fee REAL    NOT NULL DEFAULT 0,
  bio              TEXT,
  profile_image    TEXT,
  availability     TEXT    NOT NULL DEFAULT 'Available',
  rating           REAL    NOT NULL DEFAULT 4.5,
  slot_minutes     INTEGER NOT NULL DEFAULT 30,
  status           TEXT    NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive')),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_doctors_dept   ON doctors(department_id);
CREATE INDEX IF NOT EXISTS ix_doctors_status ON doctors(status);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS doctor_availability (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id  INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT    NOT NULL,
  end_time   TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doctor_id, weekday, start_time)
);

CREATE INDEX IF NOT EXISTS ix_availability_doctor
  ON doctor_availability(doctor_id, weekday);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS patients (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name              TEXT    NOT NULL,
  phone             TEXT,
  email             TEXT,
  date_of_birth     TEXT,
  gender            TEXT,
  blood_group       TEXT,
  address           TEXT,
  emergency_contact TEXT,
  department_id     INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  doctor_id         INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  room              TEXT,
  status            TEXT    NOT NULL DEFAULT 'Stable',
  admitted_at       TEXT,
  medical_history   TEXT    NOT NULL DEFAULT '[]',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_patients_user ON patients(user_id);
CREATE INDEX IF NOT EXISTS ix_patients_dept ON patients(department_id);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS appointments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id       INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id        INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  appointment_date TEXT    NOT NULL,
  appointment_time TEXT    NOT NULL,
  reason           TEXT,
  notes            TEXT,
  status           TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN (
                       'pending','confirmed','rejected','completed',
                       'cancelled','rescheduled','no_show','scheduled'
                     )),
  cancelled_by     TEXT,
  decision_note    TEXT,
  decided_at       TEXT,
  decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_appt_user   ON appointments(user_id);
CREATE INDEX IF NOT EXISTS ix_appt_doctor ON appointments(doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS ix_appt_date   ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS ix_appt_status ON appointments(status);

/* A doctor cannot hold two live appointments in the same slot.
   Cancelled / completed / no-show rows are excluded so the slot
   is released and can be re-booked. */
CREATE UNIQUE INDEX IF NOT EXISTS ux_appt_live_slot
  ON appointments(doctor_id, appointment_date, appointment_time)
  WHERE status IN ('pending','scheduled','confirmed','rescheduled');

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  title       TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'Laboratory',
  description TEXT,
  result      TEXT,
  status      TEXT    NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','Completed','Cancelled')),
  report_date TEXT    NOT NULL,
  file_path   TEXT,
  file_name   TEXT,
  mime_type   TEXT,
  file_size   INTEGER,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_reports_user ON reports(user_id);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  type       TEXT    NOT NULL DEFAULT 'info',
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_notif_user
  ON notifications(user_id, is_read, created_at DESC);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS pharmacy_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  category    TEXT,
  stock       INTEGER NOT NULL DEFAULT 0,
  unit_price  REAL    NOT NULL DEFAULT 0,
  supplier    TEXT,
  expiry_date TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS laboratory_tests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id   INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT    NOT NULL,
  test_name    TEXT    NOT NULL,
  category     TEXT,
  price        REAL    NOT NULL DEFAULT 0,
  test_date    TEXT,
  status       TEXT    NOT NULL DEFAULT 'Scheduled',
  result       TEXT    NOT NULL DEFAULT 'Pending',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS billing_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no     TEXT    NOT NULL UNIQUE,
  patient_id     INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  patient_name   TEXT    NOT NULL,
  amount         REAL    NOT NULL DEFAULT 0,
  tax            REAL    NOT NULL DEFAULT 0,
  discount       REAL    NOT NULL DEFAULT 0,
  total          REAL    NOT NULL DEFAULT 0,
  insurance      TEXT,
  method         TEXT,
  status         TEXT    NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending','Paid','Cancelled')),
  issued_at      TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_billing_status ON billing_records(status);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS emergency_cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_name  TEXT    NOT NULL,
  phone         TEXT,
  condition     TEXT,
  severity      TEXT    NOT NULL DEFAULT 'Stable'
                  CHECK (severity IN ('Critical','Serious','Stable')),
  status        TEXT    NOT NULL DEFAULT 'Active'
                  CHECK (status IN ('Active','Admitted','Discharged')),
  doctor_id     INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  arrived_at    TEXT    NOT NULL,
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS hospital_resources (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  kind   TEXT NOT NULL,
  label  TEXT NOT NULL,
  value  TEXT NOT NULL,
  meta   TEXT,
  UNIQUE (kind, label)
);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role  TEXT,
  action      TEXT    NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_action  ON audit_logs(action);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'unread'
               CHECK (status IN ('unread','read')),
  ip         TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_contact_created ON contact_messages(created_at DESC);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS chat_conversations (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
  admin_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type                  TEXT    NOT NULL
                          CHECK (type IN ('patient_admin','patient_doctor')),
  approval_request_id   INTEGER REFERENCES chat_approval_requests(id) ON DELETE SET NULL,
  status                TEXT    NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','pending','locked','archived','revoked')),
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_chat_conv_patient ON chat_conversations(patient_id);
CREATE INDEX IF NOT EXISTS ix_chat_conv_doctor  ON chat_conversations(doctor_id);
CREATE INDEX IF NOT EXISTS ix_chat_conv_type    ON chat_conversations(type, status);

/* One admin thread per patient, one doctor thread per patient+doctor pair. */
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conv_admin
  ON chat_conversations(patient_id) WHERE type = 'patient_admin';

CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_conv_doctor
  ON chat_conversations(patient_id, doctor_id) WHERE type = 'patient_doctor';

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS chat_approval_requests (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id         INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  conversation_id   INTEGER REFERENCES chat_conversations(id) ON DELETE SET NULL,
  reason            TEXT    NOT NULL,
  appointment_id    INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  initial_message   TEXT,
  status            TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  reviewed_at       TEXT,
  reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason  TEXT
);

CREATE INDEX IF NOT EXISTS ix_chat_req_patient ON chat_approval_requests(patient_id);
CREATE INDEX IF NOT EXISTS ix_chat_req_doctor  ON chat_approval_requests(doctor_id);
CREATE INDEX IF NOT EXISTS ix_chat_req_status  ON chat_approval_requests(status);

/* Only one live request per patient+doctor pair at a time. */
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_req_pending
  ON chat_approval_requests(patient_id, doctor_id) WHERE status = 'pending';

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS chat_messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role      TEXT    NOT NULL CHECK (sender_role IN ('user','doctor','admin')),
  message          TEXT    NOT NULL,
  message_type     TEXT    NOT NULL DEFAULT 'text'
                     CHECK (message_type IN ('text','file','image','audio')),
  attachment_url   TEXT,
  attachment_name  TEXT,
  attachment_mime  TEXT,
  attachment_size  INTEGER,
  attachment_duration INTEGER,
  is_read          INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_chat_msg_conv
  ON chat_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS ix_chat_msg_unread
  ON chat_messages(conversation_id, is_read);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS medical_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id      INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id  INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  diagnosis       TEXT,
  symptoms        TEXT,
  treatment       TEXT,
  notes           TEXT,
  follow_up_date  TEXT,
  recorded_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_history_patient ON medical_history(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS ix_history_doctor  ON medical_history(doctor_id);

/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS prescriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id     INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  medicine      TEXT    NOT NULL,
  dosage        TEXT,
  frequency     TEXT,
  duration      TEXT,
  instructions  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_prescriptions_patient ON prescriptions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_prescriptions_doctor  ON prescriptions(doctor_id);
`);

/* ==================================================================
   MIGRATIONS

   CREATE TABLE IF NOT EXISTS cannot add columns to a table that
   already exists, so incremental changes go here. Each step is
   idempotent and never touches existing rows.
================================================================== */

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();

  if (columns.some((row) => row.name === column)) return;

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[db] migration: added ${table}.${column}`);
}

/* Whether the browser was told to keep this session after it closes. */
addColumnIfMissing("sessions", "persistent", "INTEGER NOT NULL DEFAULT 0");

/* An admin's emailed reply to a contact-form submission — kept on the
   same row rather than a separate table since a contact message gets
   at most one reply, not an open-ended thread. */
addColumnIfMissing("contact_messages", "reply_message", "TEXT");
addColumnIfMissing("contact_messages", "replied_at", "TEXT");

/*
 * Appointment approval workflow.
 *
 * A patient booking now lands as 'pending' and waits for an explicit
 * administrator decision (approve / reject / keep pending). SQLite
 * cannot alter a CHECK constraint in place, so the table is rebuilt
 * once — inside a transaction, copying every row across.
 */
function migrateAppointmentStatuses() {
  const done = db
    .prepare(`SELECT value FROM schema_meta WHERE key = 'appt_status_v2'`)
    .get();

  if (done) return;

  const existing =
    db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appointments'`
      )
      .get()?.sql || "";

  const markDone = () =>
    db
      .prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('appt_status_v2', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      )
      .run();

  /* A freshly created database already has the new constraint. */
  if (existing.includes("'pending'")) {
    markDone();
    return;
  }

  console.log("[db] migration: adding pending/rejected appointment statuses...");

  db.pragma("foreign_keys = OFF");

  db.exec(`
    BEGIN;

    CREATE TABLE appointments_v2 (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      patient_id       INTEGER REFERENCES patients(id) ON DELETE SET NULL,
      doctor_id        INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
      department_id    INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      appointment_date TEXT    NOT NULL,
      appointment_time TEXT    NOT NULL,
      reason           TEXT,
      notes            TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending'
                         CHECK (status IN (
                           'pending','confirmed','rejected','completed',
                           'cancelled','rescheduled','no_show','scheduled'
                         )),
      cancelled_by     TEXT,
      decision_note    TEXT,
      decided_at       TEXT,
      decided_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO appointments_v2
      (id, user_id, patient_id, doctor_id, department_id, appointment_date,
       appointment_time, reason, notes, status, cancelled_by, created_at, updated_at)
    SELECT
       id, user_id, patient_id, doctor_id, department_id, appointment_date,
       appointment_time, reason, notes,
       CASE WHEN status = 'scheduled' THEN 'pending' ELSE status END,
       cancelled_by, created_at, updated_at
      FROM appointments;

    DROP TABLE appointments;
    ALTER TABLE appointments_v2 RENAME TO appointments;

    COMMIT;
  `);

  /* Indexes belong to the dropped table, so recreate them. */
  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_appt_user   ON appointments(user_id);
    CREATE INDEX IF NOT EXISTS ix_appt_doctor ON appointments(doctor_id, appointment_date);
    CREATE INDEX IF NOT EXISTS ix_appt_date   ON appointments(appointment_date);
    CREATE INDEX IF NOT EXISTS ix_appt_status ON appointments(status);

    CREATE UNIQUE INDEX IF NOT EXISTS ux_appt_live_slot
      ON appointments(doctor_id, appointment_date, appointment_time)
      WHERE status IN ('pending','scheduled','confirmed','rescheduled');
  `);

  db.pragma("foreign_keys = ON");

  markDone();

  const moved = db
    .prepare(`SELECT COUNT(*) AS n FROM appointments WHERE status = 'pending'`)
    .get().n;

  console.log(`[db] migration complete — ${moved} appointment(s) now pending`);
}

migrateAppointmentStatuses();

/* Present on rebuilt tables; added here for databases already migrated. */
addColumnIfMissing("appointments", "decision_note", "TEXT");
addColumnIfMissing("appointments", "decided_at", "TEXT");
addColumnIfMissing("appointments", "decided_by", "INTEGER");

/*
 * Doctor login accounts + doctor <-> patient chat.
 *
 * Doctors originally had no login of their own — `doctors` was a pure
 * catalog table. Real-time chat requires an authenticated doctor-side
 * participant, so a `doctor` role is added to `users` (SQLite cannot
 * alter a CHECK constraint in place, so the table is rebuilt once,
 * exactly like migrateAppointmentStatuses above) and each doctor
 * catalog row gains an optional `user_id` link to its login account.
 */
function migrateUserRoles() {
  const done = db
    .prepare(`SELECT value FROM schema_meta WHERE key = 'user_role_doctor_v1'`)
    .get();

  if (done) return;

  const existing =
    db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`
      )
      .get()?.sql || "";

  const markDone = () =>
    db
      .prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('user_role_doctor_v1', '1')
         ON CONFLICT(key) DO UPDATE SET value = '1'`
      )
      .run();

  if (existing.includes("'doctor'")) {
    markDone();
    return;
  }

  console.log("[db] migration: adding doctor role to users...");

  db.pragma("foreign_keys = OFF");

  db.exec(`
    BEGIN;

    CREATE TABLE users_v2 (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT    NOT NULL,
      email                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      phone                 TEXT,
      password_hash         TEXT    NOT NULL,
      role                  TEXT    NOT NULL DEFAULT 'user'
                              CHECK (role IN ('user','admin','doctor')),
      status                TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','inactive')),
      date_of_birth         TEXT,
      gender                TEXT,
      avatar_color          TEXT,
      last_login            TEXT,
      login_count           INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO users_v2 SELECT * FROM users;

    DROP TABLE users;
    ALTER TABLE users_v2 RENAME TO users;

    COMMIT;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_users_role   ON users(role);
    CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);
  `);

  db.pragma("foreign_keys = ON");

  markDone();

  console.log("[db] migration complete — users.role now accepts 'doctor'");
}

migrateUserRoles();

/* Links a doctor catalog row to its login account, once one exists. */
addColumnIfMissing(
  "doctors",
  "user_id",
  "INTEGER REFERENCES users(id) ON DELETE SET NULL"
);
db.exec(`CREATE INDEX IF NOT EXISTS ix_doctors_user ON doctors(user_id);`);

/* ==================================================================
   CHAT ATTACHMENTS + VOICE NOTES

   `message_type` was created with a CHECK that only allowed
   'text' | 'file' | 'image'. Voice notes need 'audio', and SQLite
   cannot alter a CHECK in place — the table is rebuilt, exactly like
   the appointment and user migrations above.

   The attachment metadata columns are added separately, so a database
   that already has the new constraint still picks them up.
================================================================== */

function migrateChatMessageTypes() {
  const existing =
    db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chat_messages'`
      )
      .get()?.sql || "";

  /* A freshly created database already allows 'audio'. */
  if (existing.includes("'audio'")) return;

  console.log("[db] migration: allowing audio chat messages...");

  db.pragma("foreign_keys = OFF");

  db.exec(`
    BEGIN;

    CREATE TABLE chat_messages_v2 (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role      TEXT    NOT NULL CHECK (sender_role IN ('user','doctor','admin')),
      message          TEXT    NOT NULL,
      message_type     TEXT    NOT NULL DEFAULT 'text'
                         CHECK (message_type IN ('text','file','image','audio')),
      attachment_url   TEXT,
      is_read          INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO chat_messages_v2
      (id, conversation_id, sender_id, sender_role, message,
       message_type, attachment_url, is_read, created_at, updated_at)
    SELECT
       id, conversation_id, sender_id, sender_role, message,
       message_type, attachment_url, is_read, created_at, updated_at
      FROM chat_messages;

    DROP TABLE chat_messages;
    ALTER TABLE chat_messages_v2 RENAME TO chat_messages;

    CREATE INDEX IF NOT EXISTS ix_chat_msg_conv
      ON chat_messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS ix_chat_msg_unread
      ON chat_messages(conversation_id, is_read);

    COMMIT;
  `);

  db.pragma("foreign_keys = ON");

  console.log("[db] migration complete — chat_messages.message_type accepts 'audio'");
}

migrateChatMessageTypes();

/* What the attachment actually is, so the UI can render it without
   guessing from the stored filename. */
addColumnIfMissing("chat_messages", "attachment_name", "TEXT");
addColumnIfMissing("chat_messages", "attachment_mime", "TEXT");
addColumnIfMissing("chat_messages", "attachment_size", "INTEGER");
addColumnIfMissing("chat_messages", "attachment_duration", "INTEGER");

/* ==================================================================
   CLINICAL STAFF ROLES

   Nurses and receptionists work inside the hospital but are neither
   administrators nor doctors: they need ward/bed and front-desk
   access without the account and billing powers an admin has. Same
   rebuild dance as migrateUserRoles above — SQLite cannot widen a
   CHECK in place.

   This runs BEFORE the new addColumnIfMissing calls below so the
   rebuild never has to know about columns added afterwards.
================================================================== */

function migrateStaffRoles() {
  const existing =
    db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`
      )
      .get()?.sql || "";

  if (existing.includes("'nurse'")) return;

  console.log("[db] migration: adding nurse/receptionist roles to users...");

  db.pragma("foreign_keys = OFF");

  db.exec(`
    BEGIN;

    CREATE TABLE users_v3 (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT    NOT NULL,
      email                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      phone                 TEXT,
      password_hash         TEXT    NOT NULL,
      role                  TEXT    NOT NULL DEFAULT 'user'
                              CHECK (role IN ('user','admin','doctor','nurse','receptionist')),
      status                TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','inactive')),
      date_of_birth         TEXT,
      gender                TEXT,
      avatar_color          TEXT,
      last_login            TEXT,
      login_count           INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO users_v3
      (id, name, email, phone, password_hash, role, status, date_of_birth,
       gender, avatar_color, last_login, login_count, failed_login_attempts,
       created_at, updated_at)
    SELECT
       id, name, email, phone, password_hash, role, status, date_of_birth,
       gender, avatar_color, last_login, login_count, failed_login_attempts,
       created_at, updated_at
      FROM users;

    DROP TABLE users;
    ALTER TABLE users_v3 RENAME TO users;

    COMMIT;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS ix_users_role   ON users(role);
    CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);
  `);

  db.pragma("foreign_keys = ON");

  console.log("[db] migration complete — users.role accepts nurse/receptionist");
}

migrateStaffRoles();

/* Which department a nurse or receptionist actually works in, and
   whether they're at the hospital right now — the two things a real
   staff directory needs that a doctor's own richer profile doesn't
   fit here, since only doctors get their own table. Meaningless for
   admin/doctor/patient accounts, so both stay nullable. */
addColumnIfMissing(
  "users",
  "department_id",
  "INTEGER REFERENCES departments(id) ON DELETE SET NULL"
);
addColumnIfMissing("users", "duty_status", "TEXT");

/* ==================================================================
   WARDS + BEDS

   `hospital_resources` holds headline counters (ICU capacity, blood
   units) as loose key/value rows. Individual beds need real identity
   — which ward, which patient, since when — so they get their own
   tables rather than being squeezed into that shape.
================================================================== */

db.exec(`
CREATE TABLE IF NOT EXISTS wards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  kind       TEXT    NOT NULL DEFAULT 'general'
               CHECK (kind IN ('general','icu','private','maternity','pediatric','emergency')),
  floor      TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_id     INTEGER NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','occupied','reserved','maintenance')),
  patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  occupied_at TEXT,
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ward_id, label)
);

CREATE INDEX IF NOT EXISTS ix_beds_ward    ON beds(ward_id, status);
CREATE INDEX IF NOT EXISTS ix_beds_patient ON beds(patient_id);
`);

/* Which ward a nurse is responsible for. Unassigned (NULL) nurses see
   every ward, matching the behaviour before this column existed —
   assigning one narrows that nurse to just it. Meaningless for any
   other role, so it stays nullable there too. */
addColumnIfMissing(
  "users",
  "assigned_ward_id",
  "INTEGER REFERENCES wards(id) ON DELETE SET NULL"
);

db.exec(`
/* ---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS discharge_summaries (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id           INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id            INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  admitted_on          TEXT,
  discharged_on        TEXT    NOT NULL,
  diagnosis            TEXT,
  treatment_summary    TEXT,
  medications          TEXT,
  follow_up_instructions TEXT,
  condition_on_discharge TEXT,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_discharge_patient
  ON discharge_summaries(patient_id, discharged_on DESC);

/* ----------------------------------------------------------------
   One row per (appointment, channel) actually delivered. The unique
   constraint is the whole point: the reminder sweep runs on a timer
   and must never send the same patient the same reminder twice.
---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  channel        TEXT    NOT NULL CHECK (channel IN ('email','whatsapp','inapp')),
  offset_label   TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent','failed','skipped')),
  error          TEXT,
  sent_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (appointment_id, channel, offset_label)
);

/* ----------------------------------------------------------------
   Second-factor login codes. Kept separate from password_resets so a
   pending 2FA challenge can never be redeemed as a password reset.
---------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS login_otps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT    NOT NULL,
  consumed_at TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_login_otps_user
  ON login_otps(user_id, consumed_at, expires_at);
`);

/* The value handed back to the browser mid-login. Random and opaque
   so a caller cannot submit codes against an account by guessing its
   id — the challenge itself has to be held to answer it. */
addColumnIfMissing("login_otps", "challenge", "TEXT");
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_login_otps_challenge
     ON login_otps(challenge) WHERE challenge IS NOT NULL;`
);

/* Opt-in second factor, and the UI language the account prefers. */
addColumnIfMissing("users", "two_factor_enabled", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "language", "TEXT NOT NULL DEFAULT 'en'");

/* Teleconsultation. The room name is generated once and stored so both
   sides join the same Jitsi room across reloads. */
addColumnIfMissing("appointments", "video_room", "TEXT");
addColumnIfMissing("appointments", "mode", "TEXT NOT NULL DEFAULT 'in_person'");

/* Which bed an admitted patient currently occupies, for the ward board. */
addColumnIfMissing("patients", "bed_id", "INTEGER REFERENCES beds(id) ON DELETE SET NULL");

/* ==================================================================
   ONLINE PAYMENTS

   The gateway's own ids live on the invoice so a payment can always
   be traced back to Razorpay's dashboard, and so a repeated webhook
   or double-click is recognised as the same payment rather than
   marking the invoice paid twice.
================================================================== */

addColumnIfMissing("billing_records", "payment_order_id", "TEXT");
addColumnIfMissing("billing_records", "payment_id", "TEXT");
addColumnIfMissing("billing_records", "paid_at", "TEXT");

/* Who took the money at the counter — cash, or a card/UPI machine
   that isn't wired into this app. Null for anything paid online,
   where the Razorpay payment_id already answers "how do we know this
   was paid". */
addColumnIfMissing(
  "billing_records",
  "collected_by",
  "INTEGER REFERENCES users(id) ON DELETE SET NULL"
);

db.exec(`
  CREATE INDEX IF NOT EXISTS ix_billing_payment_order
    ON billing_records(payment_order_id);
`);

db.prepare(
  `INSERT INTO schema_meta (key, value)
   VALUES ('version', '3')
   ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                  updated_at = datetime('now')`
).run();

export default db;
