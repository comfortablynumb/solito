import { CommandConfig } from "../config/config";
import { FileSystem } from "../filesystem/filesystem";
import { VariableResolver } from "../interpolation/variable-resolver";

export interface CommandResolveResult {
  prompt: string;
  isCommand: boolean;
  commandName?: string;
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
    const commandConfig = this.commands[input];

    if (!commandConfig) {
      return { prompt: input, isCommand: false };
    }

    const resolvedPath = this.variableResolver.resolve(
      commandConfig.prompt,
      commandConfig.variables,
    );

    const content = await this.filesystem.readFile(resolvedPath);

    const resolvedContent = this.variableResolver.resolve(
      content,
      commandConfig.variables,
    );

    return { prompt: resolvedContent, isCommand: true, commandName: input };
  }
}
