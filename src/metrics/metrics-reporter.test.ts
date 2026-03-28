import * as http from "http";
import { HttpMetricsReporter, MetricsPayload } from "./metrics-reporter";
import { createMockLogger } from "../test/mock-logger";

describe("HttpMetricsReporter", () => {
  let server: http.Server;
  let receivedBody: string;
  let port: number;

  beforeEach((done) => {
    receivedBody = "";
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedBody = body;
        res.writeHead(200);
        res.end();
      });
    });
    server.listen(0, () => {
      port = (server.address() as { port: number }).port;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  describe("ping", () => {
    it("resolves when server is reachable", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: `localhost:${port}`, logger });

      await expect(reporter.ping()).resolves.toBeUndefined();
    });

    it("rejects when server is unreachable", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: "localhost:1", logger });

      await expect(reporter.ping()).rejects.toThrow("Cannot reach metrics server");
    });
  });

  describe("report", () => {
    it("sends payload as JSON POST to /api/metrics", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: `localhost:${port}`, logger });
      const payload: MetricsPayload = {
        instanceId: "test-instance-1",
        command: "quality",
        project: "/proj",
        timestamp: "2026-03-14T10:00:00Z",
        loop: 1,
        status: "SUCCESS",
        metrics: { coverage_percent: 72.5 },
        description: "test run",
      };

      await reporter.report(payload);

      expect(JSON.parse(receivedBody)).toEqual(payload);
    });

    it("uses status as detail when description is empty", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: `localhost:${port}`, logger });
      const payload: MetricsPayload = {
        instanceId: "test-instance-1",
        command: "quality",
        project: "/proj",
        timestamp: "2026-03-14T10:00:00Z",
        loop: 1,
        status: "SUCCESS",
        metrics: {},
        description: "",
      };

      await reporter.report(payload);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("SUCCESS"),
      );
    });

    it("uses empty detail when both description and status are empty", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: `localhost:${port}`, logger });
      const payload: MetricsPayload = {
        instanceId: "test-instance-1",
        command: "quality",
        project: "/proj",
        timestamp: "2026-03-14T10:00:00Z",
        loop: 1,
        status: "",
        metrics: {},
        description: "",
      };

      await reporter.report(payload);

      expect(logger.info).toHaveBeenCalled();
    });

    it("logs warning on connection error without throwing", async () => {
      const logger = createMockLogger();
      const reporter = new HttpMetricsReporter({ baseUrl: "localhost:1", logger });
      const payload: MetricsPayload = {
        instanceId: "test-instance-1",
        command: "quality",
        project: "/proj",
        timestamp: "2026-03-14T10:00:00Z",
        loop: 1,
        status: "SUCCESS",
        metrics: {},
        description: "",
      };

      await reporter.report(payload);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Metrics report failed"));
    });
  });
});
