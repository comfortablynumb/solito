import { MetricsReporter, MetricsPayload } from "./metrics-reporter";
import { FileSystem } from "../filesystem/filesystem";
import { Logger } from "../util/logger";

export interface MetricsWatcher {
  start(): void;
  stop(): void;
}

export interface TsvMetricsWatcherDeps {
  tsvPath: string;
  instanceId: string;
  command: string;
  project: string;
  reporter: MetricsReporter;
  filesystem: FileSystem;
  logger: Logger;
  pollIntervalMs?: number;
}

export class TsvMetricsWatcher implements MetricsWatcher {
  private readonly tsvPath: string;
  private readonly instanceId: string;
  private readonly command: string;
  private readonly project: string;
  private readonly reporter: MetricsReporter;
  private readonly filesystem: FileSystem;
  private readonly logger: Logger;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private lastLineCount = 0;

  constructor(deps: TsvMetricsWatcherDeps) {
    this.tsvPath = deps.tsvPath;
    this.instanceId = deps.instanceId;
    this.command = deps.command;
    this.project = deps.project;
    this.reporter = deps.reporter;
    this.filesystem = deps.filesystem;
    this.logger = deps.logger;
    this.pollIntervalMs = deps.pollIntervalMs ?? 30000;
  }

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      const exists = await this.filesystem.exists(this.tsvPath);

      if (!exists) {
        return;
      }

      const content = await this.filesystem.readFile(this.tsvPath);
      const lines = content.trim().split("\n");

      if (lines.length < 2) {
        return;
      }

      const headers = lines[0].split("\t").map((h) => h.trim());
      const newLines = lines.slice(Math.max(1, this.lastLineCount));
      this.lastLineCount = lines.length;

      for (const line of newLines) {
        if (!line.trim()) continue;

        const payload = this.buildPayload(headers, line);
        await this.reporter.report(payload);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Metrics watcher poll failed: ${message}`);
    }
  }

  private buildPayload(headers: string[], line: string): MetricsPayload {
    const row = this.parseRow(headers, line);
    const metrics = this.extractMetrics(headers, row);

    const commit = row["commit"] ?? row["commit_hash"] ?? undefined;

    return {
      instanceId: this.instanceId,
      command: this.command,
      project: this.project,
      timestamp: new Date().toISOString(),
      loop: parseInt(row["loop"] ?? "0", 10) || 0,
      status: row["status"] ?? "SUCCESS",
      metrics,
      description: row["description"] ?? row["notes"] ?? "",
      ...(commit ? { commit } : {}),
    };
  }

  private parseRow(headers: string[], line: string): Record<string, string> {
    const values = line.split("\t").map((v) => v.trim());
    const row: Record<string, string> = {};

    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }

    return row;
  }

  private extractMetrics(
    headers: string[],
    row: Record<string, string>,
  ): Record<string, number> {
    const metrics: Record<string, number> = {};
    const skipKeys = new Set([
      "loop", "status", "description", "notes",
      "date", "timestamp", "commit", "commit_hash",
      "category", "metric_improved",
    ]);

    for (const key of headers) {
      if (skipKeys.has(key)) continue;

      const val = row[key];

      if (val !== undefined && val !== "" && !isNaN(Number(val))) {
        metrics[key] = parseFloat(val);
      }
    }

    return metrics;
  }
}
