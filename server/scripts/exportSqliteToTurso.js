import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import db from "../db.js";
import { config } from "../config/env.js";

/* ==================================================================
   ONE-TIME DATA IMPORT: local better-sqlite3 file -> Turso

   Run this once, after `npm run db:migrate` has created the schema
   on the target database (set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN
   before running either command). It copies every row out of the
   old local `server/data/healthcare.db` file so the admin account
   and any seeded/demo data created during local development survive
   the move.

   Safe to skip entirely on a brand new install — `npm run db:seed`
   creates a fresh admin account either way.
================================================================== */

const LEGACY_DB_FILE =
  process.env.LEGACY_DB_FILE ||
  path.join(config.root, "server", "data", "healthcare.db");

/* Dependency order doesn't matter here — foreign_keys is switched off
   for the whole import (some tables, like chat_conversations and
   chat_approval_requests, reference each other circularly, so no
   ordering actually satisfies every constraint up front anyway). */
const TABLES = [
  "users",
  "sessions",
  "password_resets",
  "departments",
  "doctors",
  "doctor_availability",
  "patients",
  "appointments",
  "reports",
  "notifications",
  "pharmacy_items",
  "laboratory_tests",
  "billing_records",
  "emergency_cases",
  "hospital_resources",
  "audit_logs",
  "contact_messages",
  "chat_conversations",
  "chat_approval_requests",
  "chat_messages",
  "medical_history",
  "prescriptions",
  "wards",
  "beds",
  "discharge_summaries",
  "appointment_reminders",
  "login_otps",
];

async function importTable(source, table) {
  const rows = source.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) return 0;

  const existing = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  if (existing.n > 0) {
    console.log(`[import] ${table}: target already has ${existing.n} row(s), skipping`);
    return 0;
  }

  const columns = Object.keys(rows[0]);
  const sql = `INSERT INTO ${table} (${columns.join(", ")})
               VALUES (${columns.map((c) => `@${c}`).join(", ")})`;
  const insert = db.prepare(sql);

  for (const row of rows) {
    await insert.run(row);
  }

  console.log(`[import] ${table}: copied ${rows.length} row(s)`);
  return rows.length;
}

async function main() {
  if (!fs.existsSync(LEGACY_DB_FILE)) {
    console.log(`[import] no legacy database file at ${LEGACY_DB_FILE} — nothing to import`);
    return;
  }

  if (!config.dbUrl.startsWith("file:") && !process.env.TURSO_DATABASE_URL) {
    throw new Error(
      "Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) before importing into the hosted database."
    );
  }

  const source = new Database(LEGACY_DB_FILE, { readonly: true });

  await db.pragma("foreign_keys = OFF");

  let total = 0;
  for (const table of TABLES) {
    total += await importTable(source, table);
  }

  await db.pragma("foreign_keys = ON");

  source.close();
  console.log(`[import] done — ${total} row(s) copied`);
}

main()
  .then(() => db.close())
  .catch((err) => {
    console.error("[import] failed:", err);
    process.exitCode = 1;
  });
