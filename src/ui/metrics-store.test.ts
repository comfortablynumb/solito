import { InMemoryMetricsStore, MetricReport } from "./metrics-store";

function createReport(overrides: Partial<MetricReport> = {}): MetricReport {
  return {
    instanceId: "inst-1",
    command: "quality",
    project: "/project",
    timestamp: "2026-03-14T10:00:00Z",
    loop: 1,
    status: "SUCCESS",
    metrics: { coverage_percent: 70 },
    description: "test",
    ...overrides,
  };
}

describe("InMemoryMetricsStore", () => {
  it("starts empty", () => {
    const store = new InMemoryMetricsStore();
    expect(store.getAll()).toEqual([]);
  });

  it("adds and retrieves reports", () => {
    const store = new InMemoryMetricsStore();
    const report = createReport();
    store.add(report);

    expect(store.getAll()).toEqual([report]);
  });

  it("filters by command", () => {
    const store = new InMemoryMetricsStore();
    store.add(createReport({ command: "quality" }));
    store.add(createReport({ command: "build" }));
    store.add(createReport({ command: "quality", loop: 2 }));

    const results = store.getByCommand("quality");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.command === "quality")).toBe(true);
  });

  it("filters by instanceId", () => {
    const store = new InMemoryMetricsStore();
    store.add(createReport({ instanceId: "inst-1" }));
    store.add(createReport({ instanceId: "inst-2" }));
    store.add(createReport({ instanceId: "inst-1", loop: 2 }));

    const results = store.getByInstance("inst-1");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.instanceId === "inst-1")).toBe(true);
  });

  it("returns copies from getAll", () => {
    const store = new InMemoryMetricsStore();
    store.add(createReport());

    const all = store.getAll();
    all.push(createReport({ loop: 99 }));
    expect(store.getAll()).toHaveLength(1);
  });

  it("returns instance info", () => {
    const store = new InMemoryMetricsStore();
    store.add(createReport({ instanceId: "a", timestamp: "2026-03-14T10:00:00Z" }));
    store.add(createReport({ instanceId: "a", timestamp: "2026-03-14T10:05:00Z", loop: 2 }));
    store.add(createReport({ instanceId: "b", command: "build", timestamp: "2026-03-14T10:01:00Z" }));

    const instances = store.getInstances();
    expect(instances).toHaveLength(2);

    const instA = instances.find((i) => i.instanceId === "a");
    expect(instA).toEqual({
      instanceId: "a",
      command: "quality",
      project: "/project",
      firstSeen: "2026-03-14T10:00:00Z",
      lastSeen: "2026-03-14T10:05:00Z",
      reportCount: 2,
    });

    const instB = instances.find((i) => i.instanceId === "b");
    expect(instB?.command).toBe("build");
    expect(instB?.reportCount).toBe(1);
  });

  it("returns empty instances when no reports", () => {
    const store = new InMemoryMetricsStore();
    expect(store.getInstances()).toEqual([]);
  });
});
