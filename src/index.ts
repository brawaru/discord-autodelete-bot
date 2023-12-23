import {
  Client,
  Collection,
  Events,
  IntentsBitField,
  MessageType,
  Routes,
  type Snowflake,
} from "discord.js";
import "dotenv/config";
import PQueue from "p-queue";
import { getChannelTTL } from "./data/channels.ts";
import ping from "./commands/ping.ts";
import setTtl from "./commands/set-ttl.ts";
import { CommandRegistry } from "./core/commands/registry.ts";
import type { MessageEntry } from "./db/schemas/messages.ts";
import {
  deleteExpiredMessage,
  getExpiredMessages,
  setMessageExpire,
} from "./data/messages.ts";

const isDebug = ["1", "true", "TRUE"].includes(process.env.DEBUG ?? "0");
if (isDebug) console.log("Is running in debug mode");

type Timestamp = number;

const queueFillsWithin = 1800;

enum MessageStatus {
  Unprocessed,
  Processing,
  Processed,
  Unprocessable,
}

type LaneMessage = MessageEntry & { status: MessageStatus };

const expiredLanes = new Collection<
  Timestamp,
  Collection<Snowflake, LaneMessage>
>();

const newLane: typeof expiredLanes extends Collection<any, infer V>
  ? () => V
  : never = () => new Collection();

export const client = new Client({
  intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages],
});

export const commandRegistry = CommandRegistry.for(client);

commandRegistry.add(ping);
commandRegistry.add(setTtl);

function currentSeconds() {
  return Math.floor(Date.now() / 1000);
}

client.on(Events.MessageCreate, async (message) => {
  if (isDebug) console.log("Message created", message.id);

  if (message.type !== MessageType.Default || message.guildId == null) {
    if (isDebug) {
      console.log(
        "Type assertion or guild guard failed for message",
        message.id
      );
    }
    return;
  }

  const ttl = await getChannelTTL({
    guildId: message.guildId,
    id: message.channelId,
  });

  if (ttl == null) {
    if (isDebug) {
      console.log("TTL exist guard failed for message", message.id);
    }

    return;
  }

  await setMessageExpire(
    {
      guildId: message.guildId,
      channelId: message.channelId,
      id: message.id,
    },
    ttl
  );

  const expiresAt = currentSeconds() + ttl;

  expiredLanes.ensure(expiresAt, newLane).ensure(message.id, () => ({
    guildId: message.guildId!,
    channelId: message.channelId,
    id: message.id,
    expiresAt,
    status: MessageStatus.Unprocessed,
  }));

  if (isDebug) {
    console.log("Pushed message to lane", expiresAt, message.id);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    await commandRegistry.runInteraction(interaction);
  }
});

client.on("ready", async () => {
  try {
    await commandRegistry.pushAll();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});

await client.login(process.env.DISCORD_TOKEN);

async function backfillLanes() {
  const d = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const expiredMessages = await getExpiredMessages({
      guildId: guild.id,
      expiredSince: d,
      expiresWithin: queueFillsWithin,
    });

    for (const message of expiredMessages) {
      if (!guild.channels.cache.has(message.channelId)) {
        await deleteExpiredMessage(message);
        continue;
      }

      expiredLanes
        .ensure(message.expiresAt, newLane)
        .ensure(message.id, () => ({
          ...message,
          status: MessageStatus.Unprocessed,
        }));
    }
  }
}

try {
  await backfillLanes();
  console.log("Successfull backfilled the lanes");
} catch (err) {
  console.error("Cannot backfill lanes", err);
}

function createRunner() {
  const q = new PQueue({ concurrency: 100 });
  let isLocked = false;

  async function processMessage(message: LaneMessage) {
    console.log("Processing message", message.id);

    if (
      message.status === MessageStatus.Processed ||
      message.status === MessageStatus.Unprocessable
    ) {
      return;
    }

    try {
      await client.rest.delete(
        Routes.channelMessage(message.channelId, message.id)
      );
    } catch (err) {
      console.error("Cannot delete message", message.id, err);
      message.status = MessageStatus.Unprocessable;
    }
  }

  async function run() {
    for (const timestamp of [...expiredLanes.keys()]) {
      if (timestamp > currentSeconds()) continue;

      console.log("Processing lane", timestamp);

      const lane = expiredLanes.get(timestamp)!;

      for (const [messageId, message] of [...lane.entries()]) {
        if (message.status !== MessageStatus.Unprocessed) continue;

        message.status = MessageStatus.Processing;

        console.log("Queued message", message.id);

        await q.add(async () => {
          await processMessage(message);
          await deleteExpiredMessage(message);
          lane.delete(messageId);
          if (lane.size === 0) expiredLanes.delete(timestamp);
        });
      }

      console.log("Waiting until the queue is empty...");
      await q.onEmpty();

      console.log("Lane processed", timestamp);
    }
  }

  async function runLocked() {
    if (isLocked) return;

    isLocked = true;
    try {
      await run();
    } finally {
      isLocked = false;
    }
  }

  return runLocked;
}

setInterval(createRunner(), 1000);
