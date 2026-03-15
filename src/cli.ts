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
import { executeUiCommand } from "./commands/ui-command";
import { DefaultCommandResolver } from "./commands/command-resolver";
import { DefaultVariableResolver } from "./interpolation/variable-resolver";
import { HttpMetricsReporter } from "./metrics/metrics-reporter";
import { TsvMetricsWatcher } from "./metrics/metrics-watcher";
import { MetricsWatcher } from "./metrics/metrics-watcher";
import { AgentConfig, SolitoConfig } from "./config/config";
import { ConsoleLogger } from "./util/logger";
import { RunCommand } from "./args";
import { randomUUID } from "crypto";
import * as path from "path";

function joinPrompts(...parts: (string | undefined)[]): string | undefined {
  const defined = parts.filter((p): p is string => !!p);
  return defined.length > 0 ? defined.join("\n\n") : undefined;
}

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
      projectConfigLoader,
      output: console.log,
    });
    process.exit(code);
  }

  if (command.kind === "ui") {
    const code = await executeUiCommand({
      host: command.host,
      port: command.port,
      cwd,
      filesystem,
      logger: new ConsoleLogger(),
    });
    process.exit(code);
  }

  const code = await handleRunCommand(command, configLoader, filesystem, cwd);
  process.exit(code);
}

interface RunCommandContext {
  config: SolitoConfig;
  workspace: DefaultWorkspaceInitializer;
  commandResolver: DefaultCommandResolver;
  filesystem: FileSystem;
  cwd: string;
}

async function buildRunContext(
  configLoader: YamlConfigLoader, filesystem: FileSystem, cwd: string,
): Promise<RunCommandContext> {
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

  return { config, workspace, commandResolver, filesystem, cwd };
}

async function handleRunCommand(
  command: RunCommand, configLoader: YamlConfigLoader, filesystem: FileSystem, cwd: string,
): Promise<number> {
  const ctx = await buildRunContext(configLoader, filesystem, cwd);

  const resolved = command.rawPrompt
    ? { prompt: command.prompt, isCommand: false, commandName: undefined }
    : await ctx.commandResolver.resolve(command.prompt);

  if (!command.rawPrompt && !resolved.isCommand) {
    console.error(`Error: unknown command "${command.prompt}". Use "solito prompt '<your prompt>'" for raw prompts.`);
    printUsage();
    return 1;
  }

  const { prompt, progressDir } = await resolvePrompt(command, resolved, ctx);

  const agentName = command.agentName ?? ctx.config.default_agent;
  const agent = getAgent(agentName, { verbose: command.verbose });
  const agentConfig = buildAgentConfig(ctx.config, agentName, resolved.commandName);
  const logger = new ConsoleLogger();

  const watcher = await setupMetricsWatcher(command, resolved.commandName, progressDir, cwd, logger);

  try {
    return await executeRunCommand({
      agent,
      prompt,
      agentConfig,
      loopConfig: ctx.config.loop,
      passthrough: command.passthrough,
      progressDir,
      verbose: command.verbose,
    });
  } finally {
    watcher?.stop();
  }
}

interface ResolvedPrompt {
  prompt: string;
  progressDir?: string;
}

async function resolvePrompt(
  command: RunCommand,
  resolved: { prompt: string; isCommand: boolean; commandName?: string; inlinePrompt?: string },
  ctx: RunCommandContext,
): Promise<ResolvedPrompt> {
  if (!resolved.isCommand || !resolved.commandName) {
    return { prompt: resolved.prompt };
  }

  const commandWorkDir = await ctx.workspace.ensureCommandDir(resolved.commandName);
  const combinedExtraPrompt = joinPrompts(resolved.inlinePrompt, command.extraPrompt);

  const dynamicBuiltIns = await buildDynamicBuiltIns({
    filesystem: ctx.filesystem,
    spec: command.spec,
    extraPrompt: combinedExtraPrompt,
  });

  const postResolver = new DefaultVariableResolver({
    builtIns: {
      command_work_dir: commandWorkDir,
      max_turn_time_minutes: String(ctx.config.loop.max_turn_time_minutes),
      ...dynamicBuiltIns,
    },
  });
  const interpolated = postResolver.resolve(resolved.prompt);

  const promptFilePath = path.join(commandWorkDir, "prompt.md");
  await ctx.filesystem.writeFile(promptFilePath, interpolated);

  return {
    prompt: `Read the file at ${promptFilePath} and follow all instructions in it precisely. Start working immediately.`,
    progressDir: commandWorkDir,
  };
}

async function setupMetricsWatcher(
  command: RunCommand,
  commandName: string | undefined,
  progressDir: string | undefined,
  cwd: string,
  logger: ConsoleLogger,
): Promise<MetricsWatcher | undefined> {
  if (!command.reportMetrics || !progressDir) {
    return undefined;
  }

  const reporter = new HttpMetricsReporter({
    host: command.apiHost,
    port: command.apiPort,
    logger,
  });

  logger.info(`Metrics reporting enabled → ${command.apiHost}:${command.apiPort}`);

  try {
    await reporter.ping();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Metrics server not reachable: ${message}`);
    logger.error("Start the dashboard with 'solito ui' before using --report-metrics.");
    process.exit(1);
  }

  const instanceId = randomUUID();
  const resolvedCommandName = commandName ?? command.prompt;
  logger.info(`Instance ID: ${instanceId}`);

  await reporter.report({
    instanceId,
    command: resolvedCommandName,
    project: cwd,
    timestamp: new Date().toISOString(),
    loop: 0,
    status: "CONNECTED",
    metrics: {},
    description: "Instance started",
  });

  const watcher = new TsvMetricsWatcher({
    tsvPath: path.join(progressDir, "log.tsv"),
    instanceId,
    command: resolvedCommandName,
    project: cwd,
    reporter,
    filesystem: new DefaultFileSystem(),
    logger,
    pollIntervalMs: 30000,
  });
  watcher.start();

  return watcher;
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
