import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { z } from "zod";
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
      mr_body TEXT,
      mr_branch TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const columns = z.array(z.object({ name: z.string() })).parse(sqlite.pragma("table_info(runners)"));
  if (!columns.some((column) => column.name === "mr_body")) {
    sqlite.exec("ALTER TABLE runners ADD COLUMN mr_body TEXT");
  }
  if (!columns.some((column) => column.name === "mr_branch")) {
    sqlite.exec("ALTER TABLE runners ADD COLUMN mr_branch TEXT");
  }

  return drizzle(sqlite, { schema });
}

export const db = initDb();
