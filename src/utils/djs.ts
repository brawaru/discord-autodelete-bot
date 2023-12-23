import type { Guild, GuildMemberResolvable } from "discord.js";

export async function getGuildMember(
  guild: Guild,
  member: GuildMemberResolvable
) {
  const memberId = typeof member === "string" ? member : member.id;
  return guild.members.cache.get(memberId) ?? guild.members.fetch(memberId);
}
