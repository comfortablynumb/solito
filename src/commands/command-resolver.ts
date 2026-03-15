import { CommandConfig } from "../config/config";
import { FileSystem } from "../filesystem/filesystem";
import { VariableResolver } from "../interpolation/variable-resolver";

export interface CommandResolveResult {
  prompt: string;
  isCommand: boolean;
  commandName?: string;
  inlinePrompt?: string;
}

export interface CommandResolver {
  resolve(input: string): Promise<CommandResolveResult>;
}

export interface CommandResolverDeps {
  filesystem: FileSystem;
  variableResolver: VariableResolver;
  commands?: Record<string, CommandConfig>;
}

export class DefaultCommandResolver implements CommandResolver {
  private readonly filesystem: FileSystem;
  private readonly variableResolver: VariableResolver;
  private readonly commands: Record<string, CommandConfig>;

  constructor({ filesystem, variableResolver, commands }: CommandResolverDeps) {
    this.filesystem = filesystem;
    this.variableResolver = variableResolver;
    this.commands = commands ?? {};
  }

  async resolve(input: string): Promise<CommandResolveResult> {
    const exactConfig = this.commands[input];

    if (exactConfig) {
      return this.resolveCommand(input, exactConfig);
    }

    const spaceIndex = input.indexOf(" ");

    if (spaceIndex !== -1) {
      const firstWord = input.substring(0, spaceIndex);
      const rest = input.substring(spaceIndex + 1).trim();
      const config = this.commands[firstWord];

      if (config && rest) {
        const result = await this.resolveCommand(firstWord, config);
        return { ...result, inlinePrompt: rest };
      }
    }

    return { prompt: input, isCommand: false };
  }

  private async resolveCommand(
    name: string,
    config: CommandConfig,
  ): Promise<CommandResolveResult> {
    const resolvedPath = this.variableResolver.resolve(
      config.prompt,
      config.variables,
    );

    const content = await this.filesystem.readFile(resolvedPath);

    const resolvedContent = this.variableResolver.resolve(
      content,
      config.variables,
    );

    return { prompt: resolvedContent, isCommand: true, commandName: name };
  }
}
