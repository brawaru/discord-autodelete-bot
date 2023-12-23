import { eq } from "drizzle-orm";
import { channels, db, redis } from "../db";

type MinimalChannelData = {
  guildId: string;
  id: string;
};

const redisKeys: Record<
  keyof (typeof channels)["$inferSelect"] & "configuredTTL",
  (data: MinimalChannelData) => string
> = {
  configuredTTL({ guildId, id }) {
    return `channels.${guildId}-${id}.ttl`;
  },
};

export async function getChannelConfig(
  data: MinimalChannelData,
  force = false
) {
  if (!force) {
    let cached;
    try {
      cached = await redis?.mGet([redisKeys.configuredTTL(data)]);
    } catch {}

    if (cached != null && cached.length > 0) {
      const value = Number(cached[0]);
      return Number.isNaN(value) || value === -1
        ? undefined
        : { ...data, configuredTTL: value };
    }
  }

  const channelConfig = await db.query.channels.findFirst({
    where: eq(channels.id, data.id),
  });

  try {
    await redis?.set(
      redisKeys.configuredTTL(data),
      String(channelConfig?.configuredTTL ?? -1)
    );
  } catch {}

  return channelConfig;
}

export async function getChannelTTL(data: MinimalChannelData, force = false) {
  if (!force) {
    try {
      const cached = await redis
        ?.get(redisKeys.configuredTTL(data))
        .then((value) => (value == null ? null : Number(value)));

      if (Number.isNaN(cached) || cached === -1) return null;
    } catch {}
  }

  return (await getChannelConfig(data, true))?.configuredTTL ?? null;
}

export async function setChannelTTL(
  data: MinimalChannelData,
  configuredTTL: number
) {
  await db
    .insert(channels)
    .values({ ...data, configuredTTL })
    .onConflictDoUpdate({
      target: [channels.guildId, channels.id],
      set: { configuredTTL },
    });

  try {
    await redis?.set(redisKeys.configuredTTL(data), configuredTTL);
  } catch {}
}
