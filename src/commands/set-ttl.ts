import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { defineCommand } from "../core/commands/command";
import { setChannelTTL } from "../data/channels";
import { getGuildMember } from "../utils/djs";
import { DurationFormat } from "@formatjs/intl-durationformat/lib/index";
import DurationParser from "js-duration-parser/src/index.js";

const dp = new DurationParser();
const df = new DurationFormat("en-US", { style: "long" });

const second = 1;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;

function secondsToDuration(value: number) {
  const weeks = Math.max(Math.floor(value / week), 0);
  const days = Math.max(Math.floor((value % week) / day), 0);
  const hours = Math.max(Math.floor((value % day) / hour), 0);
  const minutes = Math.max(Math.floor((value % hour) / minute), 0);
  const seconds = Math.max(Math.floor((value % minute) / second), 0);
  return { weeks, days, hours, minutes, seconds };
}

export default defineCommand({
  command: new SlashCommandBuilder()
    .setName("set-ttl")
    .setDescription("Sets time-to-live for messages")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption((option) =>
      option
        .setName("ttl")
        .setDescription(
          "A number of settings after which messages expire and deleted"
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.inGuild()) {
      interaction.followUp("This command can only be used in guilds");
      return;
    }

    if (
      interaction.channel == null ||
      interaction.channel.type !== ChannelType.GuildText
    ) {
      interaction.reply(
        "This command can only be used in regular guild channels"
      );
      return;
    }

    try {
      if (
        !(await getGuildMember(interaction.guild!, interaction.user))
          .permissionsIn(interaction.channel)
          .has("ManageChannels")
      ) {
        interaction.followUp(
          "You don't have permissions to manage this channel"
        );
        return;
      }
    } catch (err) {
      interaction.followUp("Cannot check your permissions");
      return;
    }

    const ttlOption = interaction.options.get("ttl");
    if (ttlOption == null || typeof ttlOption.value !== "string") {
      interaction.followUp("Malformed interaction");
      return;
    }

    const ttl = dp.parse(ttlOption.value, "s");

    if (ttl == null) {
      interaction.followUp("Incorrect duration");
      return;
    }

    try {
      await setChannelTTL(
        {
          guildId: interaction.guildId,
          id: interaction.channelId,
        },
        ttl
      );
    } catch (err) {
      console.error("Failed to set TTL in channel", interaction.channelId, err);
      interaction.followUp("Cannot update this setting right now");
      return;
    }

    interaction.followUp(
      `Successfully updated TTL for this channel to ${df.format(
        secondsToDuration(ttl)
      )}`
    );
  },
});
