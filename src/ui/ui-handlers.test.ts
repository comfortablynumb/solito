import { createUiHandlers, UiHandlers } from "./ui-handlers";
import { InMemoryMetricsStore, MetricReport } from "./metrics-store";
import { DefaultTsvParser } from "./tsv-parser";
import { DefaultTsvRowTransformer } from "./tsv-row-transformer";
import { createMockFileSystem } from "../test/mock-filesystem";
import { createMockLogger } from "../test/mock-logger";
import { EventEmitter } from "events";
import { IncomingMessage, ServerResponse } from "http";

function createMockRes(): ServerResponse & { _status: number; _body: string; _headers: Record<string, string> } {
  const res = {
    _status: 0,
    _body: "",
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, unknown>) {
      res._status = status;

      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          res._headers[k] = String(v);
        }
      }
    },
    end(body?: string) {
      res._body = body ?? "";
    },
  };

  return res as unknown as ServerResponse & { _status: number; _body: string; _headers: Record<string, string> };
}

function createMockReq(body?: string): IncomingMessage {
  const emitter = new EventEmitter();
  const req = emitter as IncomingMessage;

  if (body !== undefined) {
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(body));
      emitter.emit("end");
    });
  }

  return req;
}

function createReport(overrides: Partial<MetricReport> = {}): MetricReport {
  return {
    instanceId: "inst-1",
    command: "quality",
    project: "/proj",
    timestamp: "2026-03-14T10:00:00Z",
    loop: 1,
    status: "SUCCESS",
    metrics: { coverage_percent: 70 },
    description: "test",
    ...overrides,
  };
}

function buildHandlers(files: Record<string, string> = {}): {
  handlers: UiHandlers;
  store: InMemoryMetricsStore;
  logger: ReturnType<typeof createMockLogger>;
} {
  const store = new InMemoryMetricsStore();
  const logger = createMockLogger();
  const handlers = createUiHandlers({
    store,
    tsvParser: new DefaultTsvParser(),
    tsvRowTransformer: new DefaultTsvRowTransformer(),
    filesystem: createMockFileSystem(files),
    logger,
    cwd: "/project",
  });

  return { handlers, store, logger };
}

describe("UiHandlers", () => {
  describe("dashboard", () => {
    it("returns HTML with 200", () => {
      const { handlers } = buildHandlers();
      const res = createMockRes();

      handlers.dashboard(createMockReq(), res);

      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("text/html");
      expect(res._body).toContain("Solito Dashboard");
    });
  });

  describe("getAllMetrics", () => {
    it("returns all reports as JSON", () => {
      const { handlers, store } = buildHandlers();
      const report = createReport();
      store.add(report);
      const res = createMockRes();

      handlers.getAllMetrics(createMockReq(), res);

      expect(res._status).toBe(200);
      expect(JSON.parse(res._body)).toEqual([report]);
    });
  });

  describe("getMetricsByCommand", () => {
    it("returns filtered reports", () => {
      const { handlers, store } = buildHandlers();
      store.add(createReport({ command: "quality" }));
      store.add(createReport({ command: "build" }));
      const res = createMockRes();

      handlers.getMetricsByCommand(createMockReq(), res, "quality");

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      expect(body).toHaveLength(1);
      expect(body[0].command).toBe("quality");
    });
  });

  describe("getMetricsByInstance", () => {
    it("returns reports for specific instance", () => {
      const { handlers, store } = buildHandlers();
      store.add(createReport({ instanceId: "inst-1" }));
      store.add(createReport({ instanceId: "inst-2" }));
      const res = createMockRes();

      handlers.getMetricsByInstance(createMockReq(), res, "inst-1");

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      expect(body).toHaveLength(1);
      expect(body[0].instanceId).toBe("inst-1");
    });
  });

  describe("getInstances", () => {
    it("returns instance list", () => {
      const { handlers, store } = buildHandlers();
      store.add(createReport({ instanceId: "inst-1", command: "quality" }));
      store.add(createReport({ instanceId: "inst-2", command: "build" }));
      const res = createMockRes();

      handlers.getInstances(createMockReq(), res);

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      expect(body).toHaveLength(2);
    });
  });

  describe("postMetrics", () => {
    it("adds report and returns 201", async () => {
      const { handlers, store, logger } = buildHandlers();
      const report = createReport();
      const req = createMockReq(JSON.stringify(report));
      const res = createMockRes();

      handlers.postMetrics(req, res);

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(201);
      expect(store.getAll()).toHaveLength(1);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("loop=1 status=SUCCESS"));
    });

    it("logs when a new instance connects", async () => {
      const { handlers, logger } = buildHandlers();
      const report = createReport({ instanceId: "abc-12345678" });
      const req = createMockReq(JSON.stringify(report));
      const res = createMockRes();

      handlers.postMetrics(req, res);

      await new Promise((r) => setTimeout(r, 10));

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Instance connected"));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("abc-1234"));
    });

    it("logs only once per instance", async () => {
      const { handlers, logger } = buildHandlers();
      const report = createReport({ instanceId: "abc-12345678" });

      handlers.postMetrics(createMockReq(JSON.stringify(report)), createMockRes());
      await new Promise((r) => setTimeout(r, 10));

      handlers.postMetrics(createMockReq(JSON.stringify({ ...report, loop: 2 })), createMockRes());
      await new Promise((r) => setTimeout(r, 10));

      const connectLogs = logger.info.mock.calls.filter(
        (c: unknown[]) => String(c[0]).includes("Instance connected"),
      );
      expect(connectLogs).toHaveLength(1);
    });

    it("returns 400 for invalid JSON", async () => {
      const { handlers } = buildHandlers();
      const req = createMockReq("not json");
      const res = createMockRes();

      handlers.postMetrics(req, res);

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(400);
    });
  });

  describe("getTsv", () => {
    it("parses and returns MetricReport array", async () => {
      const files = { "/project/.solito/commands/quality/log.tsv": "loop\tcoverage\n1\t50\n2\t60" };
      const { handlers } = buildHandlers(files);
      const res = createMockRes();

      handlers.getTsv(createMockReq(), res, "quality");

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body);
      expect(body).toHaveLength(2);
      expect(body[0].instanceId).toBe("tsv-quality");
      expect(body[0].command).toBe("quality");
      expect(body[0].metrics).toEqual({ coverage: 50 });
    });

    it("returns 404 when TSV does not exist", async () => {
      const { handlers } = buildHandlers();
      const res = createMockRes();

      handlers.getTsv(createMockReq(), res, "quality");

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(404);
    });
  });

  describe("getAvailableCommands", () => {
    it("returns command names that have log.tsv", async () => {
      const files = {
        "/project/.solito/commands/quality/log.tsv": "loop\tcoverage\n1\t50",
        "/project/.solito/commands/build/log.tsv": "loop\tstatus\n1\tSUCCESS",
      };
      const { handlers } = buildHandlers(files);
      const res = createMockRes();

      handlers.getAvailableCommands(createMockReq(), res);

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body) as string[];
      expect(body).toContain("quality");
      expect(body).toContain("build");
    });

    it("excludes directories without log.tsv", async () => {
      const files = {
        "/project/.solito/commands/quality/log.tsv": "loop\tcoverage\n1\t50",
        "/project/.solito/commands/build/progress.md": "some content",
      };
      const { handlers } = buildHandlers(files);
      const res = createMockRes();

      handlers.getAvailableCommands(createMockReq(), res);

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(200);

      const body = JSON.parse(res._body) as string[];
      expect(body).toContain("quality");
      expect(body).not.toContain("build");
    });

    it("returns empty array when no commands exist", async () => {
      const { handlers } = buildHandlers();
      const res = createMockRes();

      handlers.getAvailableCommands(createMockReq(), res);

      await new Promise((r) => setTimeout(r, 10));

      expect(res._status).toBe(200);
      expect(JSON.parse(res._body)).toEqual([]);
    });
  });
});
