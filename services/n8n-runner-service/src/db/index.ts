import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

function initDb() {
  const dbPath = resolve(env.DATABASE_PATH);
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS runners (
      id TEXT PRIMARY KEY NOT NULL,
      repo TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      mr_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  return drizzle(sqlite, { schema });
}

export const db = initDb();
