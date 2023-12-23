import { db, messages, redis } from "../db";
import { and, eq, lte } from "drizzle-orm";

type MinimalMessageData = {
  guildId: string;
  channelId: string;
  id: string;
};

const redisKeys: Record<
  keyof (typeof messages)["$inferSelect"] & "expiresAt",
  (data: MinimalMessageData) => string
> = {
  expiresAt({ guildId, channelId, id }) {
    return `messages.${guildId}-${channelId}-${id}.expiresAt`;
  },
};

export async function setMessageExpire(
  data: MinimalMessageData,
  expiresAt: number
) {
  await db
    .insert(messages)
    .values({ ...data, expiresAt })
    .onConflictDoUpdate({
      target: [messages.guildId, messages.channelId, messages.id],
      set: { expiresAt },
    });

  try {
    await redis?.set(redisKeys.expiresAt(data), expiresAt, { EX: 3600 });
  } catch {}
}

export async function getMessageExpire(
  data: MinimalMessageData,
  forced = false
) {
  if (!forced) {
    try {
      const cached = await redis
        ?.get(redisKeys.expiresAt(data))
        .then((value) => Number(value));

      if (cached != null) return cached === -1 ? null : cached;
    } catch {}
  }

  const entry = (
    await db
      .select({ expiresAt: messages.expiresAt })
      .from(messages)
      .limit(1)
      .where(
        and(
          eq(messages.guildId, data.guildId),
          eq(messages.channelId, data.channelId),
          eq(messages.id, data.id)
        )
      )
  ).at(0);

  try {
    await redis?.set(redisKeys.expiresAt(data), entry?.expiresAt ?? -1, {
      EX: 3600,
    });
  } catch {}

  return entry?.expiresAt ?? null;
}

export async function getExpiredMessages(query: {
  guildId: string;
  expiredSince: number;
  expiresWithin?: number;
}) {
  const entries = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.guildId, query.guildId),
        lte(
          messages.expiresAt,
          query.expiredSince + Math.max(query.expiresWithin ?? 0, 0)
        )
      )
    );
  return entries.map(({ ...all }) => ({ ...all }));
}

export async function deleteExpiredMessage(
  query: (typeof messages)["$inferSelect"]
) {
  return db
    .delete(messages)
    .where(
      and(
        eq(messages.guildId, query.guildId),
        eq(messages.channelId, query.channelId),
        eq(messages.id, query.id)
      )
    )
    .then(() => {});
}
