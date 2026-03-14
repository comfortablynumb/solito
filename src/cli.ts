#!/usr/bin/env node

import { parseArgs, printUsage, listBuiltInSubcommands } from "./args";
import { getAgent } from "./agents/registry";
import { DefaultFileSystem } from "./filesystem/default-filesystem";
import { FileSystem } from "./filesystem/filesystem";
import { YamlConfigLoader } from "./config/yaml-config-loader";
import { DefaultProjectConfigLoader } from "./config/project-config-loader";
import { DefaultWorkspaceInitializer } from "./workspace/workspace-initializer";
import { getConfigDir } from "./util/paths";
import { executeRunCommand } from "./commands/run-command";
import { executeConfigCommand } from "./commands/config-command";
import { DefaultCommandResolver } from "./commands/command-resolver";
import { DefaultVariableResolver } from "./interpolation/variable-resolver";
import { AgentConfig, SolitoConfig } from "./config/config";
import * as path from "path";

async function main(): Promise<void> {
  const command = parseArgs(process.argv);
  const filesystem = new DefaultFileSystem();
  const configDir = getConfigDir();
  const cwd = process.cwd();
  const projectConfigLoader = new DefaultProjectConfigLoader({
    filesystem,
    cwd,
  });
  const configLoader = new YamlConfigLoader({
    filesystem,
    configDir,
    projectConfigLoader,
  });

  if (command.kind === "help") {
    printUsage();
    process.exit(0);
  }

  if (command.kind === "config") {
    const code = await executeConfigCommand({
      configLoader,
      output: console.log,
    });
    process.exit(code);
  }

  const config = await configLoader.load();
  validateCommandNames(config.commands);

  const workspace = new DefaultWorkspaceInitializer({ filesystem, cwd });
  await workspace.ensureProjectDir();

  const variableResolver = new DefaultVariableResolver();
  const commandResolver = new DefaultCommandResolver({
    filesystem,
    variableResolver,
    commands: config.commands,
  });

  const resolved = command.rawPrompt
    ? { prompt: command.prompt, isCommand: false, commandName: undefined }
    : await commandResolver.resolve(command.prompt);

  if (!command.rawPrompt && !resolved.isCommand) {
    console.error(`Error: unknown command "${command.prompt}". Use "solito prompt '<your prompt>'" for raw prompts.`);
    printUsage();
    process.exit(1);
  }

  let prompt = resolved.prompt;
  let progressDir: string | undefined;

  if (resolved.isCommand && resolved.commandName) {
    const commandWorkDir = await workspace.ensureCommandDir(resolved.commandName);
    progressDir = commandWorkDir;

    const dynamicBuiltIns = await buildDynamicBuiltIns({
      filesystem,
      spec: command.spec,
      extraPrompt: command.extraPrompt,
    });

    const postResolver = new DefaultVariableResolver({
      builtIns: {
        command_work_dir: commandWorkDir,
        max_turn_time_minutes: String(config.loop.max_turn_time_minutes),
        ...dynamicBuiltIns,
      },
    });
    prompt = postResolver.resolve(prompt);

    const promptFilePath = path.join(commandWorkDir, "prompt.md");
    await filesystem.writeFile(promptFilePath, prompt);
    prompt = `Read the file at ${promptFilePath} and follow all instructions in it precisely. Start working immediately.`;
  }

  const agentName = command.agentName ?? config.default_agent;
  const agent = getAgent(agentName, { verbose: command.verbose });
  const agentConfig = buildAgentConfig(config, agentName, resolved.commandName);

  const code = await executeRunCommand({
    agent,
    prompt,
    agentConfig,
    loopConfig: config.loop,
    passthrough: command.passthrough,
    progressDir,
    verbose: command.verbose,
  });

  process.exit(code);
}

function buildAgentConfig(
  config: SolitoConfig,
  agentName: string,
  commandName?: string,
): AgentConfig {
  const base = config.agents[agentName] ?? { type: agentName };
  const commandPrompt = commandName
    ? config.commands?.[commandName]?.append_system_prompt
    : undefined;

  if (!commandPrompt) {
    return base;
  }

  const merged = base.append_system_prompt
    ? `${base.append_system_prompt}\n\n${commandPrompt}`
    : commandPrompt;

  return { ...base, append_system_prompt: merged };
}

interface DynamicBuiltInsDeps {
  filesystem: FileSystem;
  spec?: string;
  extraPrompt?: string;
}

async function buildDynamicBuiltIns(deps: DynamicBuiltInsDeps): Promise<Record<string, string>> {
  const builtIns: Record<string, string> = {};

  if (deps.spec) {
    const specPath = path.resolve(deps.spec);
    const specContent = await deps.filesystem.readFile(specPath);
    builtIns.spec_section = `**Spec file** (\`${deps.spec}\`):\n\n${specContent}`;
  } else {
    builtIns.spec_section = "";
  }

  if (deps.extraPrompt) {
    builtIns.user_guidance_section = `**User guidance**: ${deps.extraPrompt}`;
  } else {
    builtIns.user_guidance_section = "";
  }

  return builtIns;
}

function validateCommandNames(commands?: Record<string, unknown>): void {
  if (!commands) {
    return;
  }

  const reserved = listBuiltInSubcommands();

  for (const name of Object.keys(commands)) {
    if (reserved.includes(name)) {
      throw new Error(
        `Custom command "${name}" conflicts with built-in subcommand "${name}". Please rename it.`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
