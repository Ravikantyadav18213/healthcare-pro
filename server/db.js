import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@libsql/client";

import { config } from "./config/env.js";

/* ==================================================================
   CONNECTION

   Talks to Turso (libSQL) in production, or a local libSQL file in
   development when TURSO_DATABASE_URL isn't set (see config.dbUrl) —
   same client, same SQL dialect, so no code path differs by
   environment. Schema creation/migration is NOT run here: it's a
   one-time step, see server/scripts/migrate.js.
================================================================== */

const client = createClient({
  url: config.dbUrl,
  authToken: config.dbAuthToken,
});

/* ==================================================================
   COMPATIBILITY SHIM

   The service layer was written against better-sqlite3's synchronous
   API (`db.prepare(sql).get/all/run(...)`, `db.transaction(fn)`).
   libSQL's client is async and network-backed, so this shim keeps the
   exact same call shapes — every service file only needed `await`
   added at call sites, not a rewrite of its SQL.
================================================================== */

/* Holds the active interactive transaction (if any) for the current
   async call chain, so nested db.prepare(...).run() calls inside a
   db.transaction(fn) callback join that transaction instead of each
   opening their own implicit one — mirrors better-sqlite3's behavior
   of a single connection sharing one transaction. */
const txStorage = new AsyncLocalStorage();

function executor() {
  return txStorage.getStore() || client;
}

/* better-sqlite3 accepts positional varargs, a single array, or a
   single named-params object across .get/.all/.run — replicate all
   three so call sites don't need to change shape. */
function normalizeArgs(args) {
  if (args.length === 0) return undefined;
  if (args.length === 1) {
    const only = args[0];
    if (only !== null && typeof only === "object") return only; // array or named object
    return [only];
  }
  return args;
}

function rowToObject(columns, row) {
  const obj = {};
  for (let i = 0; i < columns.length; i += 1) obj[columns[i]] = row[i];
  return obj;
}

function prepare(sql) {
  return {
    async get(...args) {
      const rs = await executor().execute({ sql, args: normalizeArgs(args) });
      return rs.rows.length ? rowToObject(rs.columns, rs.rows[0]) : undefined;
    },
    async all(...args) {
      const rs = await executor().execute({ sql, args: normalizeArgs(args) });
      return rs.rows.map((row) => rowToObject(rs.columns, row));
    },
    async run(...args) {
      const rs = await executor().execute({ sql, args: normalizeArgs(args) });
      return {
        changes: rs.rowsAffected,
        lastInsertRowid:
          rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid),
      };
    },
  };
}

/** Wraps fn so every db call made inside it (directly or through an
 *  already-`prepare`d statement) runs inside one write transaction,
 *  committed on success and rolled back on throw — same contract as
 *  better-sqlite3's `db.transaction(fn)`. */
function transaction(fn) {
  return async (...args) => {
    const tx = await client.transaction("write");
    try {
      const result = await txStorage.run(tx, () => fn(...args));
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        /* already closed by the failed commit/rollback path */
      }
      throw err;
    } finally {
      tx.close();
    }
  };
}

async function exec(sql) {
  await executor().executeMultiple(sql);
}

async function pragma(statement) {
  await executor().execute(`PRAGMA ${statement}`);
}

async function close() {
  client.close();
}

const db = { prepare, transaction, exec, pragma, close };

export default db;
