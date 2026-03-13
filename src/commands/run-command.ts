import { ChildProcess, execSync } from "child_process";
import { Agent, AgentRunOptions } from "../agents/agent";
import { AgentConfig, LoopConfig } from "../config/config";
import { FileSystem } from "../filesystem/filesystem";
import { DefaultFileSystem } from "../filesystem/default-filesystem";
import { Logger, ConsoleLogger } from "../util/logger";
import { getConfigDir } from "../util/paths";
import { ANSI, SEPARATOR, ICONS } from "../constants";
import * as path from "path";

const IS_WINDOWS = process.platform === "win32";
const DEFAULT_CONTINUE_PROMPT = "Continue where you left off.";
const DEFAULT_TIMEOUT_PROMPT =
  "You have reached the time limit for this loop. Please finish what you are currently doing and provide a summary of your progress.";
const PROGRESS_FILE_NAME = "loop-progress.md";

export interface RunCommandParams {
  agent: Agent;
  prompt: string;
  agentConfig?: AgentConfig;
  loopConfig?: LoopConfig;
  passthrough?: string[];
  progressDir?: string;
  logger?: Logger;
  fs?: FileSystem;
  maxIterations?: number;
}

export async function executeRunCommand(params: RunCommandParams): Promise<number> {
  const { agent, prompt, agentConfig, loopConfig, passthrough, maxIterations } = params;
  const logger = params.logger ?? new ConsoleLogger();
  const fs = params.fs ?? new DefaultFileSystem();

  const available = await agent.isAvailable();

  if (!available) {
    logger.error(`Error: "${agent.name}" is not installed or not in PATH.`);
    return 1;
  }

  const progressFilePath = getProgressFilePath(params.progressDir);
  const options = buildRunOptions({ agentConfig, loopConfig, passthrough, progressFilePath });
  const continuePrompt = loopConfig?.continue_prompt ?? DEFAULT_CONTINUE_PROMPT;
  const timeoutPrompt = loopConfig?.timeout_prompt ?? DEFAULT_TIMEOUT_PROMPT;
  const interrupted = { value: false };
  const timedOut = { value: false };
  const startTime = Date.now();

  let currentPrompt = prompt;
  let isFirstRun = true;
  let isFinalTurn = false;
  let iterationCount = 0;
  let lastExitCode = 0;

  try {
    while (true) {
      if (maxIterations !== undefined && iterationCount >= maxIterations) {
        logger.info(`Reached maximum iterations (${maxIterations}).`);
        return lastExitCode;
      }

      iterationCount++;
      const timeoutMs = getTimeoutMs(loopConfig);

      if (isFinalTurn) {
        logger.info(`Wrapping up ${agent.name} agent (time limit reached)...`);
      } else if (isFirstRun) {
        logger.info(`Running ${agent.name} agent...`);
      } else {
        writeLoopTransition({ agent, iterationCount, startTime, logger });
      }

      if (isFinalTurn) {
        writeUserPrompt(currentPrompt, logger);
      }

      const handle = agent.run(currentPrompt, options);
      interrupted.value = false;
      timedOut.value = false;
      const cleanupSignals = setupSignalForwarding(handle.child, interrupted, logger);
      const cleanupTimeout = setupTimeoutWarnings({
        timedOut,
        interrupted,
        timeoutMs,
        child: handle.child,
        logger,
      });
      const cleanupTicker = setupMinuteTicker(logger, startTime);

      try {
        const result = await handle.result;

        if (interrupted.value || isInterruptExitCode(result.exitCode)) {
          writeInterruptBanner(logger, startTime);
          return 130;
        }

        lastExitCode = result.exitCode;

        if (result.exitCode !== 0) {
          logger.info(`Agent exited with code ${result.exitCode}.`);
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
  } finally {
    await cleanupProgressFile(fs, progressFilePath);
  }
}

interface BuildRunOptionsParams {
  agentConfig?: AgentConfig;
  loopConfig?: LoopConfig;
  passthrough?: string[];
  progressFilePath: string;
}

function buildRunOptions(params: BuildRunOptionsParams): AgentRunOptions {
  return {
    appendSystemPrompt: params.agentConfig?.append_system_prompt,
    loopMaxMinutes: params.loopConfig?.max_turn_time_minutes,
    passthrough: params.passthrough,
    progressFilePath: params.progressFilePath,
  };
}

function getProgressFilePath(progressDir?: string): string {
  const dir = progressDir ?? getConfigDir();
  return path.join(dir, PROGRESS_FILE_NAME);
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

const WARNING_URGENT_OFFSET_MS = 2 * 60 * 1000;
const WARNING_FINAL_OFFSET_MS = 5 * 60 * 1000;

interface TimeoutWarningsOptions {
  timedOut: { value: boolean };
  interrupted: { value: boolean };
  timeoutMs?: number;
  child: ChildProcess;
  logger: Logger;
}

function setupTimeoutWarnings(options: TimeoutWarningsOptions): () => void {
  const { timedOut, interrupted, timeoutMs, child, logger } = options;

  if (!timeoutMs) {
    return () => {};
  }

  const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;
  const timers: NodeJS.Timeout[] = [];

  timers.push(setTimeout(() => {
    timedOut.value = true;
    const lines = [
      `${ANSI.YELLOW}${ANSI.BOLD}${ICONS.WARNING} Time limit reached (${timeoutMs / 60000} min). Please start wrapping up.${ANSI.RESET}`,
      `${ANSI.YELLOW}If your current change measurably improves metrics (coverage or complexity), commit it now.${ANSI.RESET}`,
      `${ANSI.YELLOW}If not, rollback with: git checkout -- . && git clean -fd${ANSI.RESET}`,
    ];
    logger.info(`\n${sep}\n${lines.join("\n")}\n${sep}`);
  }, timeoutMs));

  timers.push(setTimeout(() => {
    const remaining = (WARNING_FINAL_OFFSET_MS - WARNING_URGENT_OFFSET_MS) / 60000;
    const lines = [
      `${ANSI.RED}${ANSI.BOLD}${ICONS.WARNING} URGENT: Only ${remaining} minutes remaining before forced stop.${ANSI.RESET}`,
      `${ANSI.RED}${ANSI.BOLD}Commit now if metrics improved. Otherwise rollback immediately — do NOT leave uncommitted partial changes.${ANSI.RESET}`,
    ];
    logger.info(`\n${sep}\n${lines.join("\n")}\n${sep}`);
  }, timeoutMs + WARNING_URGENT_OFFSET_MS));

  timers.push(setTimeout(() => {
    interrupted.value = true;
    const msg = `${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} FINAL WARNING: Time expired. Forcing stop now. Any uncommitted changes will be lost.${ANSI.RESET}`;
    logger.info(`\n${sep}\n${msg}\n${sep}`);
    killProcessTree(child);
  }, timeoutMs + WARNING_FINAL_OFFSET_MS));

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

function setupSignalForwarding(
  child: ChildProcess,
  interrupted: { value: boolean },
  logger: Logger,
): () => void {
  let sigintCount = 0;

  const onSigint = () => {
    sigintCount++;
    interrupted.value = true;
    const sep = `${ANSI.DIM}${SEPARATOR}${ANSI.RESET}`;

    if (sigintCount === 1) {
      logger.info(`\n${sep}\n${ANSI.RED}${ANSI.BOLD}${ICONS.STOP} CTRL+C received — stopping agent...${ANSI.RESET}\n${sep}`);
      killProcessTree(child);
      return;
    }

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

function killProcessTree(child: ChildProcess): void {
  if (child.killed || !child.pid) {
    return;
  }

  if (IS_WINDOWS) {
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
    } catch {
      child.kill("SIGKILL");
    }

    return;
  }

  child.kill("SIGTERM");
}
