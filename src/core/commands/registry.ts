import {
  type Client,
  SlashCommandBuilder,
  type GuildResolvable,
  CommandInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import type { CommandDefinition, NormalizedCommandDefinition } from "./command";
import { createSetTransaction } from "../../utils/transactions";

class DefinitionState {
  public readonly pushedToGuilds = new Set<string>();
  public pushedGlobally = false;
}

export class CommandRegistry extends Set<NormalizedCommandDefinition> {
  #client: Client;
  #definitionStates = new WeakMap<
    NormalizedCommandDefinition,
    DefinitionState
  >();

  constructor(
    client: Client,
    ...defaults: ConstructorParameters<typeof Set<NormalizedCommandDefinition>>
  ) {
    super(...defaults);
    this.#client = client;
  }

  #getOrCreateDefinitionState(definition: NormalizedCommandDefinition) {
    let state = this.#definitionStates.get(definition);
    if (state == null) {
      state = new DefinitionState();
      this.#definitionStates.set(definition, state);
    }
    return state;
  }

  public isPushedGlobally(definition: NormalizedCommandDefinition) {
    return this.#definitionStates.get(definition)?.pushedGlobally ?? false;
  }

  public isPushedToGuild(
    definition: NormalizedCommandDefinition,
    guild: GuildResolvable
  ) {
    const state = this.#definitionStates.get(definition);
    if (state == null) return false;
    const guildId = this.#client.guilds.resolveId(guild);
    if (guildId == null) return false;
    return state.pushedToGuilds.has(guildId);
  }

  public async push(
    definition: NormalizedCommandDefinition,
    opts?: { houseKeeping: boolean }
  ): Promise<boolean> {
    if (!this.has(definition)) {
      return false;
    }

    if (!this.#client.isReady()) {
      throw new Error("Client must be ready to be able to manage commands");
    }

    const shouldDoHouseKeeping = opts?.houseKeeping ?? true;

    const state = this.#getOrCreateDefinitionState(definition);

    if (definition.appliesToGuild == null) {
      await this.#client.application.commands.create(definition.command);

      state.pushedGlobally = true;

      if (shouldDoHouseKeeping) {
        const guildsTransaction = createSetTransaction(state.pushedToGuilds);

        for (const guildId of state.pushedToGuilds) {
          const guild = this.#client.guilds.resolve(guildId);

          if (guild != null) {
            const command = guild.commands.cache.find(
              (command) =>
                command.applicationId === this.#client.application!.id &&
                command.name === definition.command.name
            );

            if (command != null) await guild.commands.delete(command);
          }

          guildsTransaction.delete(guildId);
        }

        guildsTransaction.commit();
      }
    } else {
      const guildsTransaction = createSetTransaction(state.pushedToGuilds);

      for (const guild of this.#client.guilds.cache.values()) {
        if (!definition.appliesToGuild(guild)) {
          if (shouldDoHouseKeeping && state.pushedToGuilds.has(guild.id)) {
            const command = guild.commands.cache.find(
              (command) =>
                command.applicationId === this.#client.application!.id &&
                command.name === definition.command.name
            );

            if (command != null) {
              await guild.commands.delete(command);
            }

            guildsTransaction.delete(guild.id);
          }

          continue;
        }

        guild.commands.create(definition.command);

        guildsTransaction.add(guild.id);
      }

      guildsTransaction.commit();

      if (shouldDoHouseKeeping && state.pushedGlobally) {
        const command = this.#client.application.commands.cache.find(
          (command) => command.name === definition.command.name
        );
        if (command != null) {
          await this.#client.application.commands.delete(command);
          state.pushedGlobally = false;
        }
      }
    }

    return definition.appliesToGuild == null
      ? state.pushedGlobally
      : state.pushedToGuilds.size > 0;
  }

  public async retract(definition: NormalizedCommandDefinition) {
    if (!this.has(definition)) {
      return false;
    }

    if (!this.#client.isReady()) {
      throw new Error("Client must be ready to be able to manage commands");
    }

    const state = this.#definitionStates.get(definition);

    if (state == null) return false;

    if (state.pushedGlobally) {
      const command = this.#client.application.commands.cache.find(
        (command) => command.name === definition.command.name
      );
      if (command != null) {
        await this.#client.application.commands.delete(command);
        state.pushedGlobally = false;
      }
    }

    const guildsTransaction = createSetTransaction(state.pushedToGuilds);

    for (const guildId of state.pushedToGuilds) {
      const guild = this.#client.guilds.resolve(guildId);
      if (guild != null) {
        const command = guild.commands.cache.find(
          (command) =>
            command.applicationId === this.#client.application!.id &&
            command.name === definition.command.name
        );
        if (command != null) {
          await guild.commands.delete(command);
          guildsTransaction.delete(guildId);
        }
      }
    }

    guildsTransaction.commit();

    return !state.pushedGlobally && state.pushedToGuilds.size === 0;
  }

  public async pushAll() {
    if (!this.#client.isReady()) {
      throw new Error("Client must be ready to be able to manage commands");
    }

    const globalStatesToMark: DefinitionState[] = [];
    const globalCommands: RESTPostAPIApplicationCommandsJSONBody[] = [];

    for (const definition of this.values()) {
      if (definition.appliesToGuild != null) continue;

      globalCommands.push(definition.command);

      globalStatesToMark.push(this.#getOrCreateDefinitionState(definition));
    }

    await this.#client.application.commands.set(globalCommands);

    for (const state of globalStatesToMark) state.pushedGlobally = true;

    for (const guild of this.#client.guilds.cache.values()) {
      const guildCommands: RESTPostAPIApplicationCommandsJSONBody[] = [];
      const statesToMark: DefinitionState[] = [];

      for (const definition of this.values()) {
        if (definition.appliesToGuild == null) continue;

        if (!(await definition.appliesToGuild(guild))) continue;

        guildCommands.push(definition.command);

        statesToMark.push(this.#getOrCreateDefinitionState(definition));
      }

      await guild.commands.set(guildCommands);

      for (const state of statesToMark) state.pushedToGuilds.add(guild.id);
    }
  }

  public async retractAll() {
    if (!this.#client.isReady()) {
      throw new Error(
        "Client must be ready to be able to unregister the commands"
      );
    }

    await this.#client.application.commands.set([]);

    for (const guild of this.#client.guilds.cache.values()) {
      await guild.commands.set([]);
    }

    // invalidate all previous states
    this.#definitionStates = new WeakMap();
  }

  public async runInteraction(interaction: CommandInteraction) {
    if (interaction.command == null) return;
    for (const definition of this.values()) {
      if (definition.command.name === interaction.command.name) {
        definition.execute(interaction);
      }
    }
  }

  static #associations = new WeakMap<Client, CommandRegistry>();

  public static for(client: Client) {
    let registry = this.#associations.get(client);

    if (registry == null) {
      registry = new CommandRegistry(client);
      this.#associations.set(client, registry);
    }

    return registry;
  }
}
