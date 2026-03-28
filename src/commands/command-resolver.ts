import { CommandConfig, CommandVariables } from "../config/config";
import { FileSystem } from "../filesystem/filesystem";
import { TemplateRenderer } from "../interpolation/template-renderer";

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
  renderer: TemplateRenderer;
  solardiRootDir: string;
  commands?: Record<string, CommandConfig>;
}

export class DefaultCommandResolver implements CommandResolver {
  private readonly filesystem: FileSystem;
  private readonly renderer: TemplateRenderer;
  private readonly solardiRootDir: string;
  private readonly commands: Record<string, CommandConfig>;

  constructor({ filesystem, renderer, solardiRootDir, commands }: CommandResolverDeps) {
    this.filesystem = filesystem;
    this.renderer = renderer;
    this.solardiRootDir = solardiRootDir;
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
    const rawTemplate = config.prompt ?? `{{ solardi_root_dir }}/prompts/${name}.md`;
    const promptTemplate = normalizePathTemplate(rawTemplate);
    const pathContext = buildPathContext(this.solardiRootDir, config.variables);
    const resolvedPath = this.renderer.render(promptTemplate, pathContext);
    const content = await this.filesystem.readFile(resolvedPath);

    return { prompt: content, isCommand: true, commandName: name };
  }
}

function normalizePathTemplate(template: string): string {
  return template.replace(/\$\{var:([^}]+)\}/g, "{{ $1 }}");
}

function buildPathContext(
  solardiRootDir: string,
  variables?: CommandVariables,
): Record<string, unknown> {
  return {
    ...(variables as Record<string, unknown> | undefined),
    solardi_root_dir: solardiRootDir,
  };
}
