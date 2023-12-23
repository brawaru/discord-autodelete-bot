import type {
  CommandInteraction,
  Guild,
  JSONEncodable,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

export interface CommandDefinition {
  command: JSONEncodable<RESTPostAPIApplicationCommandsJSONBody>;
  appliesToGuild?(guild: Guild): Promise<boolean> | boolean;
  execute(interaction: CommandInteraction): Promise<void> | void;
}

export function defineCommand(definition: CommandDefinition) {
  const { command, ...rest } = definition;
  return {
    command: command.toJSON(),
    ...rest,
  };
}

export type NormalizedCommandDefinition = ReturnType<typeof defineCommand>;
