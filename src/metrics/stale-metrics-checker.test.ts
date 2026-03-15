import { TsvStaleMetricsChecker } from "./stale-metrics-checker";
import { createMockFileSystem } from "../test/mock-filesystem";
import { DefaultTsvParser } from "../ui/tsv-parser";
import { StaleThresholds } from "../config/config";

const DEFAULT_THRESHOLDS: StaleThresholds = {
  first_warning: 2,
  second_warning: 2,
  stop: 2,
};

function buildChecker(
  files: Record<string, string> = {},
  thresholds: StaleThresholds = DEFAULT_THRESHOLDS,
) {
  const filesystem = createMockFileSystem(files);

  return new TsvStaleMetricsChecker({
    tsvPath: "/work/log.tsv",
    thresholds,
    filesystem,
    tsvParser: new DefaultTsvParser(),
  });
}

describe("TsvStaleMetricsChecker", () => {
  it("returns level=none when TSV does not exist", async () => {
    const checker = buildChecker();
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  it("returns level=none with only one row", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcoverage\n1\t50",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
  });

  it("returns level=none when metrics are improving", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t55\n3\t60",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  it("returns first_warning when stale count reaches first threshold", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("first_warning");
    expect(result.staleCount).toBe(2);
    expect(result.warningPrompt).toContain("change your approach");
  });

  it("returns level=none when stale count below first threshold", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(1);
  });

  it("treats lower complexity as improvement", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcomplexity\n1\t20\n2\t18\n3\t15",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  it("treats lower linter_issues as improvement", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tlinter_issues\n1\t10\n2\t8\n3\t5",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  it("treats lower failed_tests as improvement", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tfailed_tests\n1\t5\n2\t3\n3\t1",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  it("treats increasing complexity as stale", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tcomplexity\n1\t10\n2\t12\n3\t14",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("first_warning");
    expect(result.staleCount).toBe(2);
  });

  it("skips non-numeric columns", async () => {
    const checker = buildChecker({
      "/work/log.tsv": "loop\tstatus\tcoverage\n1\tSUCCESS\t50\n2\tSUCCESS\t50\n3\tFAIL\t50",
    });
    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("first_warning");
    expect(result.staleCount).toBe(2);
  });

  it("handles read errors gracefully", async () => {
    const fs = createMockFileSystem({ "/work/log.tsv": "data" });
    (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error("read fail"));

    const checker = new TsvStaleMetricsChecker({
      tsvPath: "/work/log.tsv",
      thresholds: DEFAULT_THRESHOLDS,
      filesystem: fs,
      tsvParser: new DefaultTsvParser(),
    });

    const result = await checker.checkAfterIteration();

    expect(result.level).toBe("none");
    expect(result.staleCount).toBe(0);
  });

  describe("two-tier warning escalation", () => {
    it("escalates to second_warning after first_warning + more stale iterations", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 2, second_warning: 2, stop: 2 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // First call: 2 stale → first_warning
      const r1 = await checker.checkAfterIteration();
      expect(r1.level).toBe("first_warning");

      // Add 2 more stale rows (total 4 stale)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50",
      );
      const r2 = await checker.checkAfterIteration();
      expect(r2.level).toBe("second_warning");
      expect(r2.warningPrompt).toContain("FINAL warning");
    });

    it("escalates to stop after second_warning + more stale iterations", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 2, second_warning: 2, stop: 2 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // First call: first_warning
      await checker.checkAfterIteration();

      // Second call: second_warning (4 stale)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50",
      );
      await checker.checkAfterIteration();

      // Third call: stop (6 stale)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50\n6\t50\n7\t50",
      );
      const r3 = await checker.checkAfterIteration();
      expect(r3.level).toBe("stop");
      expect(r3.message).toContain("Two warnings were issued");
    });

    it("resets to normal phase on improvement after first_warning", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 2, second_warning: 2, stop: 2 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // First call: first_warning (stale=2)
      const r1 = await checker.checkAfterIteration();
      expect(r1.level).toBe("first_warning");

      // Improvement: stale drops to 0
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t55",
      );
      const r2 = await checker.checkAfterIteration();
      expect(r2.level).toBe("none");
      expect(r2.staleCount).toBe(0);

      // Now needs to re-trigger first_warning again (not second_warning)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t55\n5\t55\n6\t55",
      );
      const r3 = await checker.checkAfterIteration();
      expect(r3.level).toBe("first_warning");
    });

    it("resets to normal phase on improvement after second_warning", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 2, second_warning: 2, stop: 2 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // First warning
      await checker.checkAfterIteration();

      // Second warning
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50",
      );
      const r2 = await checker.checkAfterIteration();
      expect(r2.level).toBe("second_warning");

      // Improvement
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50\n6\t55",
      );
      const r3 = await checker.checkAfterIteration();
      expect(r3.level).toBe("none");
      expect(r3.staleCount).toBe(0);

      // Needs first_warning again (fully reset)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50\n6\t55\n7\t55\n8\t55",
      );
      const r4 = await checker.checkAfterIteration();
      expect(r4.level).toBe("first_warning");
    });

    it("respects custom thresholds", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 3, second_warning: 1, stop: 1 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // 3 stale → first_warning (threshold is 3)
      const r1 = await checker.checkAfterIteration();
      expect(r1.level).toBe("first_warning");
      expect(r1.staleCount).toBe(3);

      // 1 more stale → second_warning (threshold is 1)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50",
      );
      const r2 = await checker.checkAfterIteration();
      expect(r2.level).toBe("second_warning");

      // 1 more stale → stop (threshold is 1)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50\n6\t50",
      );
      const r3 = await checker.checkAfterIteration();
      expect(r3.level).toBe("stop");
    });

    it("returns none between warning thresholds", async () => {
      const fs = createMockFileSystem({
        "/work/log.tsv": "loop\tcoverage\n1\t50\n2\t50\n3\t50",
      });
      const checker = new TsvStaleMetricsChecker({
        tsvPath: "/work/log.tsv",
        thresholds: { first_warning: 2, second_warning: 3, stop: 2 },
        filesystem: fs,
        tsvParser: new DefaultTsvParser(),
      });

      // First warning at 2 stale
      const r1 = await checker.checkAfterIteration();
      expect(r1.level).toBe("first_warning");

      // 1 more stale — not enough for second_warning (needs 3)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50",
      );
      const r2 = await checker.checkAfterIteration();
      expect(r2.level).toBe("none");
      expect(r2.staleCount).toBe(3);

      // 2 more stale — still not enough (needs 3 since warning)
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50",
      );
      const r3 = await checker.checkAfterIteration();
      expect(r3.level).toBe("none");

      // 3 more stale since first warning → second_warning
      (fs.readFile as jest.Mock).mockResolvedValue(
        "loop\tcoverage\n1\t50\n2\t50\n3\t50\n4\t50\n5\t50\n6\t50",
      );
      const r4 = await checker.checkAfterIteration();
      expect(r4.level).toBe("second_warning");
    });
  });
});
