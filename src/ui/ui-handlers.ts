import { IncomingMessage, ServerResponse } from "http";
import { MetricsStore, MetricReport } from "./metrics-store";
import { TsvParser } from "./tsv-parser";
import { TsvRowTransformer } from "./tsv-row-transformer";
import { FileSystem } from "../filesystem/filesystem";
import { Logger } from "../util/logger";
import { buildDashboardHtml } from "./ui-html";
import * as path from "path";

export interface UiHandlersDeps {
  store: MetricsStore;
  tsvParser: TsvParser;
  tsvRowTransformer: TsvRowTransformer;
  filesystem: FileSystem;
  logger: Logger;
  cwd: string;
}

export interface UiHandlers {
  dashboard(req: IncomingMessage, res: ServerResponse): void;
  getAllMetrics(req: IncomingMessage, res: ServerResponse): void;
  getMetricsByCommand(req: IncomingMessage, res: ServerResponse, command: string): void;
  getMetricsByInstance(req: IncomingMessage, res: ServerResponse, instanceId: string): void;
  getInstances(req: IncomingMessage, res: ServerResponse): void;
  postMetrics(req: IncomingMessage, res: ServerResponse): void;
  getTsv(req: IncomingMessage, res: ServerResponse, command: string): void;
  getAvailableCommands(req: IncomingMessage, res: ServerResponse): void;
  getState(req: IncomingMessage, res: ServerResponse, command: string): void;
}

export function createUiHandlers(deps: UiHandlersDeps): UiHandlers {
  const seenInstances = new Set<string>();

  return {
    dashboard(_req, res) {
      sendHtml(res, 200, buildDashboardHtml());
    },

    getAllMetrics(_req, res) {
      sendJson(res, 200, deps.store.getAll());
    },

    getMetricsByCommand(_req, res, command) {
      sendJson(res, 200, deps.store.getByCommand(command));
    },

    getMetricsByInstance(_req, res, instanceId) {
      sendJson(res, 200, deps.store.getByInstance(instanceId));
    },

    getInstances(_req, res) {
      sendJson(res, 200, deps.store.getInstances());
    },

    postMetrics(req, res) {
      handlePostMetrics(req, res, deps, seenInstances);
    },

    getTsv(_req, res, command) {
      handleGetTsv(res, command, deps);
    },

    getAvailableCommands(_req, res) {
      handleGetAvailableCommands(res, deps);
    },

    getState(_req, res, command) {
      handleGetState(res, command, deps);
    },
  };
}

function handlePostMetrics(
  req: IncomingMessage,
  res: ServerResponse,
  deps: UiHandlersDeps,
  seenInstances: Set<string>,
): void {
  readBody(req, (err, body) => {
    if (err) {
      sendJson(res, 400, { error: "Invalid request body" });
      return;
    }

    try {
      const report = JSON.parse(body) as MetricReport;
      logIncomingReport(report, seenInstances, deps.logger);
      deps.store.add(report);
      sendJson(res, 201, { ok: true });
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
    }
  });
}

function logIncomingReport(report: MetricReport, seenInstances: Set<string>, logger: Logger): void {
  const sid = report.instanceId ? report.instanceId.substring(0, 8) : "unknown";

  if (report.instanceId && !seenInstances.has(report.instanceId)) {
    seenInstances.add(report.instanceId);
    logger.info(`Instance connected: ${report.command} (${sid}) from ${report.project}`);
  }

  const detail = report.description || report.status || "";
  logger.info(`[${sid}] loop=${report.loop} status=${report.status}${detail ? " — " + detail : ""}`);
}

function handleGetTsv(res: ServerResponse, command: string, deps: UiHandlersDeps): void {
  const tsvPath = path.join(deps.cwd, ".solardi", "commands", command, "log.tsv");

  deps.filesystem.exists(tsvPath).then((exists) => {
    if (!exists) {
      sendJson(res, 404, { error: "TSV file not found" });
      return;
    }

    deps.filesystem.readFile(tsvPath).then((content) => {
      const rows = deps.tsvParser.parse(content);
      const reports = deps.tsvRowTransformer.toMetricReports(rows, command, deps.cwd);
      sendJson(res, 200, reports);
    }).catch(() => {
      sendJson(res, 500, { error: "Failed to read TSV file" });
    });
  }).catch(() => {
    sendJson(res, 500, { error: "Failed to check TSV file" });
  });
}

function handleGetState(res: ServerResponse, command: string, deps: UiHandlersDeps): void {
  const statePath = path.join(deps.cwd, ".solardi", "commands", command, "state.json");

  deps.filesystem.exists(statePath).then((exists) => {
    if (!exists) {
      sendJson(res, 404, { error: "State file not found" });
      return;
    }

    deps.filesystem.readFile(statePath).then((content) => {
      try {
        const state = JSON.parse(content);
        sendJson(res, 200, state);
      } catch {
        sendJson(res, 500, { error: "Invalid state JSON" });
      }
    }).catch(() => {
      sendJson(res, 500, { error: "Failed to read state file" });
    });
  }).catch(() => {
    sendJson(res, 500, { error: "Failed to check state file" });
  });
}

function handleGetAvailableCommands(res: ServerResponse, deps: UiHandlersDeps): void {
  const commandsDir = path.join(deps.cwd, ".solardi", "commands");

  deps.filesystem.listDirectories(commandsDir).then((dirs) => {
    const checks = dirs.map((dir) => {
      const tsvPath = path.join(commandsDir, dir, "log.tsv");
      return deps.filesystem.exists(tsvPath).then((exists) => (exists ? dir : null));
    });

    return Promise.all(checks).then((results) => {
      const commands = results.filter((r): r is string => r !== null);
      sendJson(res, 200, commands);
    });
  }).catch(() => {
    sendJson(res, 500, { error: "Failed to list commands" });
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html",
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}

function readBody(req: IncomingMessage, callback: (err: Error | null, body: string) => void): void {
  let body = "";

  req.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on("end", () => callback(null, body));
  req.on("error", (err) => callback(err, ""));
}
