import { SlashCommandBuilder } from "discord.js";
import { defineCommand } from "../core/commands/command";

const definition = defineCommand({
  command: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks if the bot is online and responsive :3"),

  async execute(interaction) {
    const d = Date.now();

    await interaction.reply({ content: "Pong!!" });

    await interaction.editReply({
      content: `Pong!! (Took ${Date.now() - d}ms) :3 :3`,
    });
  },
});

export default definition;

if (import.meta.hot) {
  import.meta.hot.accept((_mod: any) => {
    const mod = _mod as unknown as typeof import("./ping.ts");
    Object.assign(definition, mod.default);
  });
}
