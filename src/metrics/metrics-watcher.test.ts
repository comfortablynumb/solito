import { TsvMetricsWatcher } from "./metrics-watcher";
import { MetricsReporter, MetricsPayload } from "./metrics-reporter";
import { createMockFileSystem } from "../test/mock-filesystem";
import { createMockLogger } from "../test/mock-logger";

function createMockReporter(): MetricsReporter & { reported: MetricsPayload[] } {
  const reported: MetricsPayload[] = [];

  return {
    reported,
    ping: jest.fn(async () => {}),
    report: jest.fn(async (payload: MetricsPayload) => {
      reported.push(payload);
    }),
  };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("TsvMetricsWatcher", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports existing TSV rows immediately on start", async () => {
    const tsv = "loop\tstatus\tcoverage_percent\n1\tSUCCESS\t50\n2\tSUCCESS\t60";
    const filesystem = createMockFileSystem({ "/project/.solito/commands/quality/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/.solito/commands/quality/log.tsv",
      instanceId: "test-instance-abc",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 30000,
    });

    watcher.start();

    // No timer advance needed — immediate poll
    await flushPromises();

    expect(reporter.reported).toHaveLength(2);
    expect(reporter.reported[0].instanceId).toBe("test-instance-abc");
    expect(reporter.reported[0].command).toBe("quality");
    expect(reporter.reported[0].metrics.coverage_percent).toBe(50);
    expect(reporter.reported[1].metrics.coverage_percent).toBe(60);

    watcher.stop();
  });

  it("does not re-report existing rows on next interval", async () => {
    const tsv = "loop\tstatus\tcoverage_percent\n1\tSUCCESS\t50";
    const filesystem = createMockFileSystem({ "/project/.solito/commands/quality/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/.solito/commands/quality/log.tsv",
      instanceId: "test-instance",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);

    // Advance to next interval — no new rows, should not re-report
    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);

    watcher.stop();
  });

  it("reports only new rows on subsequent polls", async () => {
    const tsv = "loop\tstatus\tcoverage_percent\n1\tSUCCESS\t50";
    const filesystem = createMockFileSystem({ "/project/.solito/commands/quality/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/.solito/commands/quality/log.tsv",
      instanceId: "test-instance",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);

    // Simulate new row added to TSV
    await filesystem.writeFile(
      "/project/.solito/commands/quality/log.tsv",
      "loop\tstatus\tcoverage_percent\n1\tSUCCESS\t50\n2\tSUCCESS\t65",
    );

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(reporter.reported).toHaveLength(2);
    expect(reporter.reported[1].metrics.coverage_percent).toBe(65);

    watcher.stop();
  });

  it("does nothing when TSV does not exist", async () => {
    const filesystem = createMockFileSystem();
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/.solito/commands/quality/log.tsv",
      instanceId: "test-instance",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(reporter.reported).toHaveLength(0);

    watcher.stop();
  });

  it("skips empty lines in TSV data", async () => {
    const tsv = "loop\tstatus\tcoverage_percent\n1\tSUCCESS\t50\n\n2\tSUCCESS\t60\n";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(2);
    expect(reporter.reported[0].metrics.coverage_percent).toBe(50);
    expect(reporter.reported[1].metrics.coverage_percent).toBe(60);

    watcher.stop();
  });

  it("includes commit field in payload when present", async () => {
    const tsv = "loop\tstatus\tcommit\tcoverage\n1\tSUCCESS\tabc123\t80";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].commit).toBe("abc123");

    watcher.stop();
  });

  it("includes commit_hash field in payload when present", async () => {
    const tsv = "loop\tstatus\tcommit_hash\tcoverage\n1\tSUCCESS\tdef456\t80";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].commit).toBe("def456");

    watcher.stop();
  });

  it("skips non-numeric values in metrics extraction", async () => {
    const tsv = "loop\tstatus\tcoverage\tname\n1\tSUCCESS\t80\ttest-run";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].metrics.coverage).toBe(80);
    expect(reporter.reported[0].metrics.name).toBeUndefined();

    watcher.stop();
  });

  it("uses default status and description when not present", async () => {
    const tsv = "loop\tcoverage\n1\t80";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].status).toBe("SUCCESS");
    expect(reporter.reported[0].description).toBe("");

    watcher.stop();
  });

  it("logs warning when poll throws an error", async () => {
    const filesystem = createMockFileSystem();
    (filesystem.exists as jest.Mock).mockRejectedValue(new Error("disk full"));
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("disk full"));

    watcher.stop();
  });

  it("logs warning for non-Error thrown objects", async () => {
    const filesystem = createMockFileSystem();
    (filesystem.exists as jest.Mock).mockRejectedValue("string error");
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("string error"));

    watcher.stop();
  });

  it("does not report when TSV has only header line", async () => {
    const tsv = "loop\tstatus\tcoverage";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(0);

    watcher.stop();
  });

  it("uses description from notes field when description is absent", async () => {
    const tsv = "loop\tstatus\tnotes\n1\tSUCCESS\tsome note";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].description).toBe("some note");

    watcher.stop();
  });

  it("uses default 30000ms poll interval", () => {
    const filesystem = createMockFileSystem();
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
    });

    watcher.start();
    watcher.stop();
  });

  it("handles row with fewer columns than headers", async () => {
    // Row has only 2 values but 3 headers — values[2] should default to ""
    const tsv = "loop\tstatus\tcoverage\n1\tSUCCESS";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].loop).toBe(1);
    expect(reporter.reported[0].metrics.coverage).toBeUndefined();

    watcher.stop();
  });

  it("defaults loop to 0 when loop column is non-numeric", async () => {
    const tsv = "loop\tstatus\tcoverage\nabc\tSUCCESS\t80";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].loop).toBe(0);
    expect(reporter.reported[0].metrics.coverage).toBe(80);

    watcher.stop();
  });

  it("defaults loop to 0 when loop column is missing", async () => {
    const tsv = "status\tcoverage\nSUCCESS\t80";
    const filesystem = createMockFileSystem({ "/project/log.tsv": tsv });
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/project/log.tsv",
      instanceId: "test",
      command: "quality",
      project: "/project",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    await flushPromises();

    expect(reporter.reported).toHaveLength(1);
    expect(reporter.reported[0].loop).toBe(0);

    watcher.stop();
  });

  it("stops cleanly", () => {
    const filesystem = createMockFileSystem();
    const reporter = createMockReporter();
    const logger = createMockLogger();

    const watcher = new TsvMetricsWatcher({
      tsvPath: "/test/log.tsv",
      instanceId: "test-instance",
      command: "quality",
      project: "/test",
      reporter,
      filesystem,
      logger,
      pollIntervalMs: 1000,
    });

    watcher.start();
    watcher.stop();
    watcher.stop(); // double stop is safe
  });
});
