import { text, int, sqliteTable, primaryKey } from "drizzle-orm/sqlite-core";

export const channels = sqliteTable(
  "users",
  {
    guildId: text("guild_id").notNull(),
    id: text("id").notNull(),
    configuredTTL: int("ttl").notNull(),
  },
  (table) => {
    return {
      channelKey: primaryKey({ columns: [table.guildId, table.id] }),
    };
  }
);
