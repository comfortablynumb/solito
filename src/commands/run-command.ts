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

export async function executeRunCommand(params: RunCommandParams): Promise<number> {
  const { agent, prompt, agentConfig, loopConfig, passthrough, maxIterations, verbose } = params;
  const logger = params.logger ?? new ConsoleLogger();
  const fs = params.fs ?? new DefaultFileSystem();
  const verboseLogger = verbose ? logger : undefined;

  const available = await agent.isAvailable();

  if (!available) {
    logger.error(`Error: "${agent.name}" is not installed or not in PATH.`);
    return 1;
  }

  const progressFilePath = getProgressFilePath(params.progressDir);
  const continuePrompt = loopConfig?.continue_prompt ?? DEFAULT_CONTINUE_PROMPT;
  const timeoutPrompt = loopConfig?.timeout_prompt ?? DEFAULT_TIMEOUT_PROMPT;
  const interrupted = { value: false };
  const stopAfterIteration = { value: false };
  const timedOut = { value: false };
  const startTime = Date.now();

  let currentPrompt = prompt;
  let isFirstRun = true;
  let isFinalTurn = false;
  let iterationCount = 0;
  let lastExitCode = 0;
  let consecutiveFailures = 0;

  const timeoutMs = getTimeoutMs(loopConfig);
  const iterationTimeoutMinutes = loopConfig?.max_turn_time_minutes ?? "none";
  logger.info(`${ANSI.DIM}Iteration timeout: ${iterationTimeoutMinutes} minutes (${timeoutMs ?? "none"}ms)${ANSI.RESET}`);

  try {
    while (true) {
      if (maxIterations !== undefined && iterationCount >= maxIterations && !isFinalTurn) {
        logger.info(`Reached maximum iterations (${maxIterations}).`);
        return lastExitCode;
      }

      iterationCount++;

      if (isFinalTurn && stopAfterIteration.value) {
        logger.info(`Wrapping up ${agent.name} agent (stop requested)...`);
      } else if (isFinalTurn) {
        logger.info(`Wrapping up ${agent.name} agent (time limit reached)...`);
      } else if (isFirstRun) {
        logger.info(`Running ${agent.name} agent...`);
      } else {
        writeLoopTransition({ agent, iterationCount, startTime, logger });
      }

      if (isFinalTurn) {
        writeUserPrompt(currentPrompt, logger);
      }

      const options = buildRunOptions({
        agentConfig, loopConfig, passthrough, progressFilePath, isFirstIteration: isFirstRun,
      });
      const handle = agent.run(currentPrompt, options);
      interrupted.value = false;
      timedOut.value = false;
      const cleanupSignals = setupSignalForwarding({
        child: handle.child, interrupted, stopAfterIteration, logger,
      });
      const cleanupTimeout = setupTimeoutWarnings({
        timedOut,
        interrupted,
        timeoutMs,
        child: handle.child,
        logger,
        verboseLogger,
      });
      const cleanupTicker = setupMinuteTicker(logger, startTime);

      try {
        const result = await handle.result;

        if (interrupted.value) {
          writeInterruptBanner(logger, startTime);
          return 130;
        }

        if (stopAfterIteration.value && !isFinalTurn) {
          isFinalTurn = true;
          isFirstRun = false;
          currentPrompt = await buildStopPrompt({ fs, progressFilePath });
          continue;
        }

        if (stopAfterIteration.value && isFinalTurn) {
          break;
        }

        if (isInterruptExitCode(result.exitCode)) {
          writeInterruptBanner(logger, startTime);
          return 130;
        }

        if (handle.exitRequested.value) {
          logger.error("Agent requested exit. Cannot continue without required tools.");
          return 1;
        }

        lastExitCode = handle.iterationComplete.value ? 0 : result.exitCode;

        if (lastExitCode !== 0) {
          logAgentError(logger, result.exitCode, result.stderr);

          if (isFirstRun) {
            return result.exitCode;
          }

          consecutiveFailures++;

          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.error(`Agent failed ${MAX_CONSECUTIVE_FAILURES} times in a row. Stopping.`);
            return result.exitCode;
          }
        } else {
          consecutiveFailures = 0;
        }
      } finally {
        cleanupSignals();
        cleanupTimeout();
        cleanupTicker();
      }

      const nextPrompt = await buildContinuationPrompt({
        fs,
        progressFilePath,
        timedOut: timedOut.value,
        continuePrompt,
        timeoutPrompt,
      });

      currentPrompt = nextPrompt;
      isFinalTurn = timedOut.value;
      isFirstRun = false;
    }

    if (stopAfterIteration.value) {
      writeStopBanner(logger, startTime);
    }

    return lastExitCode;
  } finally {
    await cleanupProgressFile(fs, progressFilePath);
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
  interrupted: { value: boolean };
  timeoutMs?: number;
  child: ChildProcess;
  logger: Logger;
  verboseLogger?: Logger;
}

function setupTimeoutWarnings(options: TimeoutWarningsOptions): () => void {
  const { timedOut, interrupted, timeoutMs, child, logger, verboseLogger } = options;

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
      timedOut.value = true;
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
    interrupted.value = true;
    const msg = `${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} FINAL WARNING: Time expired. Forcing stop now. Any uncommitted changes will be lost.${ANSI.RESET}`;
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

