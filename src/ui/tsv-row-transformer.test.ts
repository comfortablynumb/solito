import { DefaultTsvRowTransformer } from "./tsv-row-transformer";
import { TsvRow } from "./tsv-parser";

describe("DefaultTsvRowTransformer", () => {
  const transformer = new DefaultTsvRowTransformer();

  it("converts TSV rows to MetricReport array", () => {
    const rows: TsvRow[] = [
      { loop: "1", status: "SUCCESS", coverage: "50", complexity: "10", description: "first run" },
      { loop: "2", status: "SUCCESS", coverage: "60", complexity: "8", description: "second run" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/my-project");

    expect(reports).toHaveLength(2);
    expect(reports[0].instanceId).toBe("tsv-quality");
    expect(reports[0].command).toBe("quality");
    expect(reports[0].project).toBe("/my-project");
    expect(reports[0].loop).toBe(1);
    expect(reports[0].status).toBe("SUCCESS");
    expect(reports[0].metrics).toEqual({ coverage: 50, complexity: 10 });
    expect(reports[0].description).toBe("first run");
  });

  it("skips non-numeric values in metrics", () => {
    const rows: TsvRow[] = [
      { loop: "1", status: "OK", notes: "hello", coverage: "70", category: "test" },
    ];

    const reports = transformer.toMetricReports(rows, "build", "/proj");

    expect(reports[0].metrics).toEqual({ coverage: 70 });
  });

  it("uses index+1 as loop when loop column is missing", () => {
    const rows: TsvRow[] = [
      { coverage: "50" },
      { coverage: "60" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].loop).toBe(1);
    expect(reports[1].loop).toBe(2);
  });

  it("includes commit when present", () => {
    const rows: TsvRow[] = [
      { loop: "1", status: "SUCCESS", commit: "abc123", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].commit).toBe("abc123");
  });

  it("includes commit_hash when commit is absent", () => {
    const rows: TsvRow[] = [
      { loop: "1", status: "SUCCESS", commit_hash: "def456", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].commit).toBe("def456");
  });

  it("generates synthetic instanceId from command name", () => {
    const rows: TsvRow[] = [{ loop: "1", coverage: "80" }];

    const reports = transformer.toMetricReports(rows, "hunt-bugs", "/proj");

    expect(reports[0].instanceId).toBe("tsv-hunt-bugs");
  });

  it("falls back to index+1 when loop value is non-numeric", () => {
    const rows: TsvRow[] = [
      { loop: "abc", status: "SUCCESS", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].loop).toBe(1);
  });

  it("uses notes as description when description is absent", () => {
    const rows: TsvRow[] = [
      { loop: "1", notes: "some notes", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].description).toBe("some notes");
  });

  it("uses date field as timestamp when timestamp is absent", () => {
    const rows: TsvRow[] = [
      { loop: "1", date: "2026-03-14", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].timestamp).toBe("2026-03-14");
  });

  it("returns empty array for empty input", () => {
    const reports = transformer.toMetricReports([], "quality", "/proj");

    expect(reports).toEqual([]);
  });

  it("uses timestamp from row when available", () => {
    const rows: TsvRow[] = [
      { loop: "1", timestamp: "2026-03-14T10:00:00Z", coverage: "50" },
    ];

    const reports = transformer.toMetricReports(rows, "quality", "/proj");

    expect(reports[0].timestamp).toBe("2026-03-14T10:00:00Z");
  });
});
