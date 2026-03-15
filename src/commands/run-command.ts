import { ChildProcess } from "child_process";
import { Agent, AgentRunOptions } from "../agents/agent";
import { AgentConfig, LoopConfig } from "../config/config";
import { FileSystem } from "../filesystem/filesystem";
import { DefaultFileSystem } from "../filesystem/default-filesystem";
import { Logger, ConsoleLogger } from "../util/logger";
import { getConfigDir } from "../util/paths";
import { ANSI, SEPARATOR, ICONS } from "../constants";
import { killProcessTree } from "../process/kill-process-tree";
import * as path from "path";

const IS_WINDOWS = process.platform === "win32";
const DEFAULT_CONTINUE_PROMPT = "Continue where you left off.";
const DEFAULT_TIMEOUT_PROMPT =
  "You have reached the time limit for this loop. Please finish what you are currently doing and provide a summary of your progress.";
const DEFAULT_STOP_PROMPT =
  "The user has requested a graceful stop. Please finish what you are currently doing, commit your progress, and provide a summary.";
const PROGRESS_FILE_NAME = "loop-progress.md";
const MAX_CONSECUTIVE_FAILURES = 3;

export interface RunCommandParams {
  agent: Agent;
  prompt: string;
  agentConfig?: AgentConfig;
  loopConfig?: LoopConfig;
  passthrough?: string[];
  progressDir?: string;
  verbose?: boolean;
  logger?: Logger;
  fs?: FileSystem;
  maxIterations?: number;
}

interface LoopState {
  currentPrompt: string;
  isFirstRun: boolean;
  isFinalTurn: boolean;
  iterationCount: number;
  lastExitCode: number;
  consecutiveFailures: number;
}

interface LoopContext {
  agent: Agent;
  agentConfig?: AgentConfig;
  loopConfig?: LoopConfig;
  passthrough?: string[];
  progressFilePath: string;
  verbose?: boolean;
  logger: Logger;
  fs: FileSystem;
  maxIterations?: number;
  timeoutMs?: number;
  continuePrompt: string;
  timeoutPrompt: string;
  interrupted: { value: boolean };
  stopAfterIteration: { value: boolean };
  timedOut: { value: boolean };
  startTime: number;
}

export async function executeRunCommand(params: RunCommandParams): Promise<number> {
  const ctx = buildLoopContext(params);

  const available = await ctx.agent.isAvailable();

  if (!available) {
    ctx.logger.error(`Error: "${ctx.agent.name}" is not installed or not in PATH.`);
    return 1;
  }

  const iterationTimeoutMinutes = ctx.loopConfig?.max_turn_time_minutes ?? "none";
  ctx.logger.info(`${ANSI.DIM}Iteration timeout: ${iterationTimeoutMinutes} minutes (${ctx.timeoutMs ?? "none"}ms)${ANSI.RESET}`);

  const state: LoopState = {
    currentPrompt: params.prompt,
    isFirstRun: true,
    isFinalTurn: false,
    iterationCount: 0,
    lastExitCode: 0,
    consecutiveFailures: 0,
  };

  try {
    return await runLoop(ctx, state);
  } finally {
    await cleanupProgressFile(ctx.fs, ctx.progressFilePath);
  }
}

function buildLoopContext(params: RunCommandParams): LoopContext {
  const logger = params.logger ?? new ConsoleLogger();
  const fs = params.fs ?? new DefaultFileSystem();

  return {
    agent: params.agent,
    agentConfig: params.agentConfig,
    loopConfig: params.loopConfig,
    passthrough: params.passthrough,
    progressFilePath: getProgressFilePath(params.progressDir),
    verbose: params.verbose,
    logger,
    fs,
    maxIterations: params.maxIterations,
    timeoutMs: getTimeoutMs(params.loopConfig),
    continuePrompt: params.loopConfig?.continue_prompt ?? DEFAULT_CONTINUE_PROMPT,
    timeoutPrompt: params.loopConfig?.timeout_prompt ?? DEFAULT_TIMEOUT_PROMPT,
    interrupted: { value: false },
    stopAfterIteration: { value: false },
    timedOut: { value: false },
    startTime: Date.now(),
  };
}

async function runLoop(ctx: LoopContext, state: LoopState): Promise<number> {
  while (true) {
    if (ctx.maxIterations !== undefined && state.iterationCount >= ctx.maxIterations && !state.isFinalTurn) {
      ctx.logger.info(`Reached maximum iterations (${ctx.maxIterations}).`);
      return state.lastExitCode;
    }

    state.iterationCount++;
    logIterationStart(ctx, state);

    const iterResult = await runSingleIteration(ctx, state);

    if (iterResult.action === "return") return iterResult.code;

    if (iterResult.action === "continue") continue;

    if (iterResult.action === "break") break;

    state.currentPrompt = await buildContinuationPrompt({
      fs: ctx.fs,
      progressFilePath: ctx.progressFilePath,
      timedOut: ctx.timedOut.value,
      continuePrompt: ctx.continuePrompt,
      timeoutPrompt: ctx.timeoutPrompt,
    });
    state.isFinalTurn = ctx.timedOut.value;
    state.isFirstRun = false;
  }

  if (ctx.stopAfterIteration.value) {
    writeStopBanner(ctx.logger, ctx.startTime);
  }

  return state.lastExitCode;
}

type IterationResult =
  | { action: "return"; code: number }
  | { action: "continue" }
  | { action: "break" }
  | { action: "next" };

async function runSingleIteration(ctx: LoopContext, state: LoopState): Promise<IterationResult> {
  const options = buildRunOptions({
    agentConfig: ctx.agentConfig, loopConfig: ctx.loopConfig,
    passthrough: ctx.passthrough, progressFilePath: ctx.progressFilePath,
    isFirstIteration: state.isFirstRun,
  });
  const handle = ctx.agent.run(state.currentPrompt, options);
  ctx.interrupted.value = false;
  ctx.timedOut.value = false;

  const verboseLogger = ctx.verbose ? ctx.logger : undefined;
  const cleanupSignals = setupSignalForwarding({
    child: handle.child, interrupted: ctx.interrupted,
    stopAfterIteration: ctx.stopAfterIteration, logger: ctx.logger,
  });
  const cleanupTimeout = setupTimeoutWarnings({
    timedOut: ctx.timedOut, timeoutMs: ctx.timeoutMs,
    child: handle.child, logger: ctx.logger, verboseLogger,
  });
  const cleanupTicker = setupMinuteTicker(ctx.logger, ctx.startTime);

  try {
    return await processIterationResult(ctx, state, handle);
  } finally {
    cleanupSignals();
    cleanupTimeout();
    cleanupTicker();
  }
}

async function processIterationResult(
  ctx: LoopContext,
  state: LoopState,
  handle: ReturnType<Agent["run"]>,
): Promise<IterationResult> {
  const result = await handle.result;

  if (ctx.interrupted.value) {
    writeInterruptBanner(ctx.logger, ctx.startTime);
    return { action: "return", code: 130 };
  }

  if (ctx.stopAfterIteration.value && !state.isFinalTurn) {
    state.isFinalTurn = true;
    state.isFirstRun = false;
    state.currentPrompt = await buildStopPrompt({ fs: ctx.fs, progressFilePath: ctx.progressFilePath });
    return { action: "continue" };
  }

  if (ctx.stopAfterIteration.value && state.isFinalTurn) {
    return { action: "break" };
  }

  if (isInterruptExitCode(result.exitCode) && !ctx.timedOut.value) {
    writeInterruptBanner(ctx.logger, ctx.startTime);
    return { action: "return", code: 130 };
  }

  if (handle.exitRequested.value) {
    ctx.logger.error("Agent requested exit. Cannot continue without required tools.");
    return { action: "return", code: 1 };
  }

  return handleExitCode(ctx, state, result.exitCode, result.stderr, handle);
}

function handleExitCode(
  ctx: LoopContext,
  state: LoopState,
  exitCode: number,
  stderr: string,
  handle: ReturnType<Agent["run"]>,
): IterationResult {
  const killedByTimeout = ctx.timedOut.value && isInterruptExitCode(exitCode);
  state.lastExitCode = (handle.iterationComplete.value || killedByTimeout) ? 0 : exitCode;

  if (state.lastExitCode !== 0) {
    logAgentError(ctx.logger, exitCode, stderr);

    if (state.isFirstRun) {
      return { action: "return", code: exitCode };
    }

    state.consecutiveFailures++;

    if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      ctx.logger.error(`Agent failed ${MAX_CONSECUTIVE_FAILURES} times in a row. Stopping.`);
      return { action: "return", code: exitCode };
    }
  } else {
    state.consecutiveFailures = 0;
  }

  return { action: "next" };
}

function logIterationStart(ctx: LoopContext, state: LoopState): void {
  if (state.isFinalTurn && ctx.stopAfterIteration.value) {
    ctx.logger.info(`Wrapping up ${ctx.agent.name} agent (stop requested)...`);
  } else if (state.isFinalTurn) {
    ctx.logger.info(`Wrapping up ${ctx.agent.name} agent (time limit reached)...`);
  } else if (state.isFirstRun) {
    ctx.logger.info(`Running ${ctx.agent.name} agent...`);
  } else {
    writeLoopTransition({ agent: ctx.agent, iterationCount: state.iterationCount, startTime: ctx.startTime, logger: ctx.logger });
  }

  if (state.isFinalTurn) {
    writeUserPrompt(state.currentPrompt, ctx.logger);
  }
}

interface BuildRunOptionsParams {
  agentConfig?: AgentConfig;
  loopConfig?: LoopConfig;
  passthrough?: string[];
  progressFilePath: string;
  isFirstIteration?: boolean;
}

function buildRunOptions(params: BuildRunOptionsParams): AgentRunOptions {
  return {
    appendSystemPrompt: params.agentConfig?.append_system_prompt,
    loopMaxMinutes: params.loopConfig?.max_turn_time_minutes,
    passthrough: params.passthrough,
    progressFilePath: params.progressFilePath,
    isFirstIteration: params.isFirstIteration,
  };
}

function getProgressFilePath(progressDir?: string): string {
  const dir = progressDir ?? getConfigDir();
  return path.join(dir, PROGRESS_FILE_NAME);
}

interface StopPromptParams {
  fs: FileSystem;
  progressFilePath: string;
}

async function buildStopPrompt(params: StopPromptParams): Promise<string> {
  const progress = await readProgressFile(params.fs, params.progressFilePath);

  if (!progress) {
    return DEFAULT_STOP_PROMPT;
  }

  return [
    DEFAULT_STOP_PROMPT,
    "",
    "## Progress from previous iteration",
    "",
    progress,
  ].join("\n");
}

interface ContinuationPromptParams {
  fs: FileSystem;
  progressFilePath: string;
  timedOut: boolean;
  continuePrompt: string;
  timeoutPrompt: string;
}

async function buildContinuationPrompt(params: ContinuationPromptParams): Promise<string> {
  const { fs, progressFilePath, timedOut, continuePrompt, timeoutPrompt } = params;
  const basePrompt = timedOut ? timeoutPrompt : continuePrompt;
  const progress = await readProgressFile(fs, progressFilePath);

  if (!progress) {
    return basePrompt;
  }

  return [
    basePrompt,
    "",
    "## Progress from previous iteration",
    "",
    progress,
  ].join("\n");
}

async function readProgressFile(fs: FileSystem, filePath: string): Promise<string | null> {
  try {
    const exists = await fs.exists(filePath);

    if (!exists) {
      return null;
    }

    const content = await fs.readFile(filePath);
    return content.trim() || null;
  } catch {
    return null;
  }
}

function logAgentError(logger: Logger, exitCode: number, stderr: string): void {
  logger.error(`Agent exited with code ${exitCode}.`);

  const trimmed = stderr.trim();

  if (trimmed) {
    logger.error(trimmed);
  }
}

async function cleanupProgressFile(fs: FileSystem, filePath: string): Promise<void> {
  try {
    const exists = await fs.exists(filePath);

    if (exists) {
      await fs.writeFile(filePath, "");
    }
  } catch {
    // Best effort cleanup
  }
}

function getTimeoutMs(loopConfig?: LoopConfig): number | undefined {
  if (!loopConfig?.max_turn_time_minutes) {
    return undefined;
  }

  return loopConfig.max_turn_time_minutes * 60 * 1000;
}

const WARNING_SOFT_BEFORE_MS = 5 * 60 * 1000;
const WARNING_URGENT_BEFORE_MS = 2 * 60 * 1000;

interface WriteStdinOptions {
  child: ChildProcess;
  text: string;
  logger?: Logger;
}

function writeStdinMessage(options: WriteStdinOptions): void {
  const { child, text, logger } = options;

  if (!child.stdin || child.stdin.destroyed) {
    return;
  }

  const message = JSON.stringify({
    type: "user",
    message: { role: "user", content: text },
  });

  if (logger) {
    logger.info(`${ANSI.DIM}[stdin] ${message}${ANSI.RESET}`);
  }

  child.stdin.write(message + "\n");
}

type WarningLevel = "soft" | "urgent" | "final";

function buildWarningText(level: WarningLevel, remainingMs: number): string {
  const remaining = remainingMs / 60000;

  if (level === "soft") {
    return [
      `${remaining} minutes remaining. Please start wrapping up.`,
      "If your current change measurably improves metrics (coverage or complexity), commit it now.",
      "If not, rollback with: git checkout -- . && git clean -fd",
    ].join("\n");
  }

  if (level === "urgent") {
    return [
      `URGENT: Only ${remaining} minutes remaining before forced stop.`,
      "Commit now if metrics improved. Otherwise rollback immediately — do NOT leave uncommitted partial changes.",
    ].join("\n");
  }

  return "FINAL WARNING: Time expired. Forcing stop now. Any uncommitted changes will be lost.";
}

interface TimeoutWarningsOptions {
  timedOut: { value: boolean };
  timeoutMs?: number;
  child: ChildProcess;
  logger: Logger;
  verboseLogger?: Logger;
}

function setupTimeoutWarnings(options: TimeoutWarningsOptions): () => void {
  const { timedOut, timeoutMs, child, logger, verboseLogger } = options;

  if (!timeoutMs) {
    return () => {};
  }

  const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
  const timers: NodeJS.Timeout[] = [];

  const softAt = Math.max(0, timeoutMs - WARNING_SOFT_BEFORE_MS);
  const urgentAt = Math.max(0, timeoutMs - WARNING_URGENT_BEFORE_MS);
  const softRemainingMs = timeoutMs - softAt;
  const urgentRemainingMs = timeoutMs - urgentAt;

  if (softAt > 0) {
    timers.push(setTimeout(() => {
      const softRemaining = softRemainingMs / 60000;
      const lines = [
        `${ANSI.YELLOW}${ANSI.BOLD}${ICONS.WARNING} ${softRemaining} minutes remaining. Please start wrapping up.${ANSI.RESET}`,
        `${ANSI.YELLOW}If your current change measurably improves metrics (coverage or complexity), commit it now.${ANSI.RESET}`,
        `${ANSI.YELLOW}If not, rollback with: git checkout -- . && git clean -fd${ANSI.RESET}`,
      ];
      logger.info(`\n${sep}\n${lines.join("\n")}\n${sep}`);
      writeStdinMessage({ child, text: buildWarningText("soft", softRemainingMs), logger: verboseLogger });
    }, softAt));
  }

  if (urgentAt > 0 && urgentAt > softAt) {
    timers.push(setTimeout(() => {
      const urgentRemaining = urgentRemainingMs / 60000;
      const lines = [
        `${ANSI.RED}${ANSI.BOLD}${ICONS.WARNING} URGENT: Only ${urgentRemaining} minutes remaining before forced stop.${ANSI.RESET}`,
        `${ANSI.RED}${ANSI.BOLD}Commit now if metrics improved. Otherwise rollback immediately — do NOT leave uncommitted partial changes.${ANSI.RESET}`,
      ];
      logger.info(`\n${sep}\n${lines.join("\n")}\n${sep}`);
      writeStdinMessage({ child, text: buildWarningText("urgent", urgentRemainingMs), logger: verboseLogger });
    }, urgentAt));
  }

  timers.push(setTimeout(() => {
    timedOut.value = true;
    const msg = `${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} FINAL WARNING: Time expired. Restarting agent for next loop.${ANSI.RESET}`;
    logger.info(`\n${sep}\n${msg}\n${sep}`);
    writeStdinMessage({ child, text: buildWarningText("final", 0), logger: verboseLogger });
    killProcessTree(child);
  }, timeoutMs));

  return () => timers.forEach((t) => clearTimeout(t));
}

interface LoopTransitionParams {
  agent: Agent;
  iterationCount: number;
  startTime: number;
  logger: Logger;
}

function writeLoopTransition(params: LoopTransitionParams): void {
  const { agent, iterationCount, startTime, logger } = params;
  const elapsed = formatElapsed(Date.now() - startTime);
  const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
  const message = `${ANSI.GREEN}${ANSI.BOLD}${ICONS.LOOP} Starting ${agent.name} loop ${iterationCount} (${elapsed} elapsed)${ANSI.RESET}`;
  logger.info(`\n${sep}\n${message}\n${sep}`);
}

function writeInterruptBanner(logger: Logger, startTime: number): void {
  const elapsed = formatElapsed(Date.now() - startTime);
  const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
  const message = `${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} Interrupted after ${elapsed}. Goodbye.${ANSI.RESET}`;
  logger.info(`\n${sep}\n${message}\n${sep}`);
}

function writeStopBanner(logger: Logger, startTime: number): void {
  const elapsed = formatElapsed(Date.now() - startTime);
  const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
  const message = `${ANSI.YELLOW}${ANSI.BOLD}${ICONS.STOP} Stopped after ${elapsed}. Iteration completed gracefully.${ANSI.RESET}`;
  logger.info(`\n${sep}\n${message}\n${sep}`);
}

function writeUserPrompt(prompt: string, logger: Logger): void {
  const separator = `\n${ANSI.DIM}${SEPARATOR}${ANSI.RESET}\n`;
  const header = `${ANSI.CYAN}${ICONS.USER} User:${ANSI.RESET}`;
  const body = `\n  ${ANSI.DIM}${prompt}${ANSI.RESET}`;
  logger.info(`${separator}${header}${body}`);
}

function setupMinuteTicker(logger: Logger, startTime: number): () => void {
  let minuteCount = 0;

  const timer = setInterval(() => {
    minuteCount++;
    const now = new Date();
    const time = formatTime(now);
    const elapsed = formatElapsed(Date.now() - startTime);
    const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
    logger.info(`\n${sep}\n${ANSI.DIM}${ICONS.TIME} ${time} (minute ${minuteCount}, total ${elapsed})${ANSI.RESET}\n${sep}`);
  }, 60_000);

  return () => clearInterval(timer);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

interface SignalForwardingOptions {
  child: ChildProcess;
  interrupted: { value: boolean };
  stopAfterIteration: { value: boolean };
  logger: Logger;
}

const SIGINT_DEBOUNCE_MS = 500;

function setupSignalForwarding(options: SignalForwardingOptions): () => void {
  const { child, interrupted, stopAfterIteration, logger } = options;
  let lastSigintTime = 0;

  const onSigint = () => {
    const now = Date.now();
    const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;

    if (!stopAfterIteration.value) {
      stopAfterIteration.value = true;
      lastSigintTime = now;
      logger.info(`\n${sep}\n${ANSI.YELLOW}${ANSI.BOLD}${ICONS.STOP} CTRL+C received — will stop after current iteration finishes. Press CTRL+C again to force quit.${ANSI.RESET}\n${sep}`);
      return;
    }

    if (now - lastSigintTime < SIGINT_DEBOUNCE_MS) {
      return;
    }

    interrupted.value = true;
    logger.info(`\n${sep}\n${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} CTRL+C received again — force quitting${ANSI.RESET}\n${sep}`);
    killProcessTree(child);
    process.exit(130);
  };

  const onSigterm = () => {
    interrupted.value = true;
    const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
    logger.info(`\n${sep}\n${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} SIGTERM received — stopping agent...${ANSI.RESET}\n${sep}`);
    killProcessTree(child);
  };

  process.on("SIGINT", onSigint);

  if (!IS_WINDOWS) {
    process.on("SIGTERM", onSigterm);
  }

  return () => {
    process.removeListener("SIGINT", onSigint);

    if (!IS_WINDOWS) {
      process.removeListener("SIGTERM", onSigterm);
    }
  };
}

const WINDOWS_CTRL_C_EXIT = 0xC000013A;
const UNIX_SIGINT_EXIT = 130;

function isInterruptExitCode(exitCode: number): boolean {
  return exitCode === UNIX_SIGINT_EXIT || exitCode === WINDOWS_CTRL_C_EXIT;
}
