import { TsvRow } from "./tsv-parser";
import { MetricReport } from "./metrics-store";

export interface TsvRowTransformer {
  toMetricReports(rows: TsvRow[], command: string, project: string): MetricReport[];
}

const SKIP_KEYS = new Set([
  "loop", "status", "description", "notes",
  "date", "timestamp", "commit", "commit_hash",
  "category", "metric_improved", "spec",
]);

export class DefaultTsvRowTransformer implements TsvRowTransformer {
  toMetricReports(rows: TsvRow[], command: string, project: string): MetricReport[] {
    const instanceId = `tsv-${command}`;
    return rows.map((row, index) => this.rowToReport(row, index, instanceId, command, project));
  }

  private rowToReport(
    row: TsvRow, index: number, instanceId: string, command: string, project: string,
  ): MetricReport {
    return {
      instanceId,
      command,
      project,
      timestamp: row["timestamp"] || row["date"] || new Date().toISOString(),
      loop: parseInt(row["loop"] ?? String(index + 1), 10) || index + 1,
      status: row["status"] || "SUCCESS",
      metrics: this.extractMetrics(row),
      description: row["description"] || row["notes"] || "",
      ...this.extractCommit(row),
      ...this.extractSpec(row),
    };
  }

  private extractCommit(row: TsvRow): { commit: string } | Record<string, never> {
    const commit = row["commit"] || row["commit_hash"];
    return commit ? { commit } : {};
  }

  private extractSpec(row: TsvRow): { spec: string } | Record<string, never> {
    const spec = row["spec"];
    return spec ? { spec } : {};
  }

  private extractMetrics(row: TsvRow): Record<string, number> {
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
}
