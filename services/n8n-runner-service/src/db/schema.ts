import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runners = sqliteTable("runners", {
  id: text("id").primaryKey(),
  repo: text("repo").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  mrUrl: text("mr_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
