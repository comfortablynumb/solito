import { FileSystem } from "../filesystem/filesystem";
import { StaleThresholds } from "../config/config";
import { TsvParser, TsvRow } from "../ui/tsv-parser";

export type StaleWarningLevel = "none" | "first_warning" | "second_warning" | "stop";

export interface StaleCheckResult {
  level: StaleWarningLevel;
  staleCount: number;
  message?: string;
  warningPrompt?: string;
}

export interface StaleMetricsChecker {
  checkAfterIteration(): Promise<StaleCheckResult>;
}

export interface StaleMetricsCheckerDeps {
  tsvPath: string;
  thresholds: StaleThresholds;
  filesystem: FileSystem;
  tsvParser: TsvParser;
}

type Phase = "normal" | "warned_once" | "warned_twice";

const SKIP_KEYS = new Set([
  "loop", "status", "description", "notes",
  "date", "timestamp", "commit", "commit_hash",
  "category", "metric_improved",
]);

const LOWER_IS_BETTER = [
  "complexity", "avg_complexity", "max_complexity",
  "lint", "linter", "warning", "error", "fail",
  "violation", "issue", "bug", "debt", "duplicate", "smell",
];

export class TsvStaleMetricsChecker implements StaleMetricsChecker {
  private readonly deps: StaleMetricsCheckerDeps;
  private phase: Phase = "normal";
  private lastStaleCount = 0;
  private staleCountAtWarning = 0;

  constructor(deps: StaleMetricsCheckerDeps) {
    this.deps = deps;
  }

  async checkAfterIteration(): Promise<StaleCheckResult> {
    const rows = await this.readRows();

    if (rows.length < 2) {
      return { level: "none", staleCount: 0 };
    }

    const staleCount = this.countStaleTrailing(rows);

    if (staleCount < this.lastStaleCount) {
      return this.handleImprovement(staleCount);
    }

    this.lastStaleCount = staleCount;
    return this.evaluatePhase(staleCount);
  }

  private handleImprovement(staleCount: number): StaleCheckResult {
    this.phase = "normal";
    this.staleCountAtWarning = 0;
    this.lastStaleCount = staleCount;
    return { level: "none", staleCount };
  }

  private evaluatePhase(staleCount: number): StaleCheckResult {
    const { thresholds } = this.deps;

    if (this.phase === "normal") {
      return this.evaluateNormal(staleCount, thresholds);
    }

    if (this.phase === "warned_once") {
      return this.evaluateWarnedOnce(staleCount, thresholds);
    }

    return this.evaluateWarnedTwice(staleCount, thresholds);
  }

  private evaluateNormal(staleCount: number, thresholds: StaleThresholds): StaleCheckResult {
    if (staleCount >= thresholds.first_warning) {
      this.phase = "warned_once";
      this.staleCountAtWarning = staleCount;
      return {
        level: "first_warning",
        staleCount,
        warningPrompt: buildFirstWarningPrompt(staleCount),
      };
    }

    return { level: "none", staleCount };
  }

  private evaluateWarnedOnce(staleCount: number, thresholds: StaleThresholds): StaleCheckResult {
    const sinceWarning = staleCount - this.staleCountAtWarning;

    if (sinceWarning >= thresholds.second_warning) {
      this.phase = "warned_twice";
      this.staleCountAtWarning = staleCount;
      return {
        level: "second_warning",
        staleCount,
        warningPrompt: buildSecondWarningPrompt(staleCount),
      };
    }

    return { level: "none", staleCount };
  }

  private evaluateWarnedTwice(staleCount: number, thresholds: StaleThresholds): StaleCheckResult {
    const sinceWarning = staleCount - this.staleCountAtWarning;

    if (sinceWarning >= thresholds.stop) {
      return {
        level: "stop",
        staleCount,
        message: buildStopMessage(staleCount, thresholds),
      };
    }

    return { level: "none", staleCount };
  }

  private async readRows(): Promise<TsvRow[]> {
    try {
      const exists = await this.deps.filesystem.exists(this.deps.tsvPath);

      if (!exists) return [];

      const content = await this.deps.filesystem.readFile(this.deps.tsvPath);
      return this.deps.tsvParser.parse(content);
    } catch {
      return [];
    }
  }

  private countStaleTrailing(rows: TsvRow[]): number {
    let staleCount = 0;

    for (let i = rows.length - 1; i >= 1; i--) {
      if (hasImprovement(rows[i - 1], rows[i])) break;
      staleCount++;
    }

    return staleCount;
  }
}

function extractNumericMetrics(row: TsvRow): Record<string, number> {
  const metrics: Record<string, number> = {};

  for (const key of Object.keys(row)) {
    if (SKIP_KEYS.has(key)) continue;

    const val = row[key];

    if (val !== undefined && val !== "" && !isNaN(Number(val))) {
      metrics[key] = parseFloat(val);
    }
  }

  return metrics;
}

function isLowerBetter(key: string): boolean {
  const lower = key.toLowerCase();
  return LOWER_IS_BETTER.some((pattern) => lower.includes(pattern));
}

function hasImprovement(previous: TsvRow, current: TsvRow): boolean {
  const prev = extractNumericMetrics(previous);
  const curr = extractNumericMetrics(current);
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);

  for (const key of allKeys) {
    if (prev[key] === undefined || curr[key] === undefined) continue;

    const delta = curr[key] - prev[key];

    if (Math.abs(delta) < 0.01) continue;

    if (isLowerBetter(key) && delta < 0) return true;

    if (!isLowerBetter(key) && delta > 0) return true;
  }

  return false;
}

function buildFirstWarningPrompt(staleCount: number): string {
  return [
    `WARNING: No metric improvements detected for ${staleCount} consecutive iterations.`,
    "",
    "You MUST change your approach immediately:",
    "1. Review what you have tried so far (check the progress file).",
    "2. Document what approaches you attempted and why they did not improve metrics.",
    "3. Try a RADICALLY different strategy — target different metrics, use different techniques.",
    "4. Do NOT repeat approaches you have already tried.",
    "5. Save detailed notes about your new approach in the progress file.",
  ].join("\n");
}

function buildSecondWarningPrompt(staleCount: number): string {
  return [
    `URGENT WARNING: No metric improvements for ${staleCount} consecutive iterations despite previous warning.`,
    "This is the FINAL warning before auto-stop.",
    "",
    "You MUST try a fundamentally different strategy:",
    "1. Review ALL previous approaches documented in the progress file.",
    "2. Choose something COMPLETELY different from everything tried so far.",
    "3. Consider: different files, different metrics, different refactoring patterns.",
    "4. If no improvements are possible, document why and commit what you have.",
    "5. The system will STOP automatically if the next iterations show no improvement.",
  ].join("\n");
}

function buildStopMessage(staleCount: number, thresholds: StaleThresholds): string {
  const total = thresholds.first_warning + thresholds.second_warning + thresholds.stop;
  return [
    `No metric improvements detected for ${staleCount} consecutive iterations (limit: ${total}).`,
    "Two warnings were issued but no improvements followed.",
    "Stopping — further iterations are unlikely to produce improvements.",
    "To continue, increase stale thresholds in your config or try a different approach.",
  ].join("\n");
}
