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
import { executeVersionCommand } from "./commands/version-command";
import { DefaultCommandResolver } from "./commands/command-resolver";
import { TwigTemplateRenderer } from "./interpolation/template-renderer";
import { findSolardiRootDir } from "./interpolation/variable-resolver";
import { HttpMetricsReporter } from "./metrics/metrics-reporter";
import { TsvMetricsWatcher } from "./metrics/metrics-watcher";
import { MetricsWatcher } from "./metrics/metrics-watcher";
import { TsvStaleMetricsChecker } from "./metrics/stale-metrics-checker";
import { DefaultTsvParser } from "./ui/tsv-parser";
import { AgentConfig, SolardiConfig } from "./config/config";
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

  if (command.kind === "version") {
    const code = await executeVersionCommand({ output: console.log });
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
  config: SolardiConfig;
  workspace: DefaultWorkspaceInitializer;
  commandResolver: DefaultCommandResolver;
  renderer: TwigTemplateRenderer;
  solardiRootDir: string;
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

  const renderer = new TwigTemplateRenderer();
  const solardiRootDir = findSolardiRootDir();
  const commandResolver = new DefaultCommandResolver({
    filesystem,
    renderer,
    solardiRootDir,
    commands: config.commands,
  });

  return { config, workspace, commandResolver, renderer, solardiRootDir, filesystem, cwd };
}

async function handleRunCommand(
  command: RunCommand, configLoader: YamlConfigLoader, filesystem: FileSystem, cwd: string,
): Promise<number> {
  const ctx = await buildRunContext(configLoader, filesystem, cwd);

  const resolved = command.rawPrompt
    ? { prompt: command.prompt, isCommand: false, commandName: undefined }
    : await ctx.commandResolver.resolve(command.prompt);

  if (!command.rawPrompt && !resolved.isCommand) {
    console.error(`Error: unknown command "${command.prompt}". Use "solardi prompt '<your prompt>'" for raw prompts.`);
    printUsage();
    return 1;
  }

  const commandConfig = ctx.config.commands?.[resolved.commandName!];
  const isOneShot = commandConfig?.one_shot ?? false;
  const combined = joinPrompts(resolved.inlinePrompt, command.extraPrompt);

  if (commandConfig?.requires_prompt && !combined) {
    console.error(`Error: ${resolved.commandName} requires a prompt.`);
    console.error(`Usage: solardi ${resolved.commandName} '<feature description>'`);
    return 1;
  }

  const { prompt, progressDir } = await resolvePrompt(command, resolved, ctx);

  const agentName = command.agentName ?? ctx.config.default_agent;
  const agent = getAgent(agentName, { verbose: command.verbose });
  const agentConfig = buildAgentConfig(ctx.config, agentName, resolved.commandName);
  const logger = new ConsoleLogger();

  const watcher = await setupMetricsWatcher(command, resolved.commandName, progressDir, cwd, logger);

  const staleChecker = buildStaleChecker(progressDir, ctx.config, ctx.filesystem);

  try {
    return await executeRunCommand({
      agent,
      prompt,
      agentConfig,
      loopConfig: ctx.config.loop,
      passthrough: command.passthrough,
      progressDir,
      verbose: command.verbose,
      staleChecker,
      isOneShot,
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
  const context = await buildTemplateContext({ command, resolved, ctx, commandWorkDir });
  const rendered = ctx.renderer.render(resolved.prompt, context);

  const promptFilePath = path.join(commandWorkDir, "prompt.md");
  await ctx.filesystem.writeFile(promptFilePath, rendered);

  return {
    prompt: `Read the file at ${promptFilePath} and follow all instructions in it precisely. Start working immediately.`,
    progressDir: commandWorkDir,
  };
}

interface TemplateContextParams {
  command: RunCommand;
  resolved: { commandName?: string; inlinePrompt?: string };
  ctx: RunCommandContext;
  commandWorkDir: string;
}

async function buildTemplateContext(
  params: TemplateContextParams,
): Promise<Record<string, unknown>> {
  const { command, resolved, ctx, commandWorkDir } = params;

  const inlinePrompt = resolved.inlinePrompt;
  const extraPrompt = command.extraPrompt;
  const combinedGuidance = joinPrompts(inlinePrompt, extraPrompt);

  let spec_path = "";
  let spec_content = "";
  let spec_section = "";

  if (command.spec) {
    spec_path = path.resolve(command.spec);
    spec_content = await ctx.filesystem.readFile(spec_path);
    spec_section = `**Spec file** (\`${command.spec}\`):\n\n${spec_content}`;
  }

  const user_guidance_section = combinedGuidance
    ? `**User guidance**: ${combinedGuidance}`
    : "";

  const spec_number = await computeNextSpecNumber(ctx.filesystem, ctx.cwd);

  const commandConfig = ctx.config.commands?.[resolved.commandName!];
  const commandVars = (commandConfig?.variables ?? {}) as Record<string, unknown>;

  return {
    ...commandVars,
    command_work_dir: commandWorkDir,
    solardi_root_dir: ctx.solardiRootDir,
    max_turn_time_minutes: ctx.config.loop.max_turn_time_minutes,
    spec_number,
    spec_path,
    spec_content,
    spec_section,
    user_guidance_section,
    args: [inlinePrompt].filter(Boolean),
    extra_prompt: extraPrompt ?? "",
    force_verify: command.forceVerify,
    env: process.env,
  };
}

async function setupMetricsWatcher(
  command: RunCommand,
  commandName: string | undefined,
  progressDir: string | undefined,
  cwd: string,
  logger: ConsoleLogger,
): Promise<MetricsWatcher | undefined> {
  if (!progressDir) {
    return undefined;
  }

  const reporter = new HttpMetricsReporter({
    baseUrl: command.metricsBaseUrl,
    logger,
  });

  logger.info(`Metrics reporting → ${command.metricsBaseUrl}`);

  try {
    await reporter.ping();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Metrics server not reachable: ${message}`);
    logger.warn("Start the dashboard with 'solardi ui' for live metrics. Continuing without metrics.");
    return undefined;
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
  config: SolardiConfig,
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


function buildStaleChecker(
  progressDir: string | undefined, config: SolardiConfig, filesystem: FileSystem,
): TsvStaleMetricsChecker | undefined {
  if (!progressDir || !config.loop.stale) {
    return undefined;
  }

  return new TsvStaleMetricsChecker({
    tsvPath: path.join(progressDir, "log.tsv"),
    thresholds: config.loop.stale,
    filesystem,
    tsvParser: new DefaultTsvParser(),
  });
}

async function computeNextSpecNumber(filesystem: FileSystem, cwd: string): Promise<string> {
  const specsDir = path.join(cwd, "specs");
  const files = await filesystem.listFiles(specsDir);
  const numbers = files
    .map((f) => /^(\d+)-/.exec(f))
    .filter(Boolean)
    .map((m) => parseInt(m![1], 10));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(3, "0");
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
