import {
  text,
  int,
  sqliteTable,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const messages = sqliteTable(
  "messages",
  {
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    id: text("id").notNull(),
    expiresAt: int("expires_at").notNull(),
  },
  (table) => {
    return {
      messageKey: primaryKey({
        name: "message_key",
        columns: [table.guildId, table.channelId, table.id],
      }),
      queringIdx: index("quering_idx").on(table.guildId, table.expiresAt),
    };
  }
);

export type MessageEntry = (typeof messages)["$inferSelect"];
