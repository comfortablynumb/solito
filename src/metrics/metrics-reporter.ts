import * as http from "http";
import { Logger } from "../util/logger";

export interface MetricsReporter {
  ping(): Promise<void>;
  report(payload: MetricsPayload): Promise<void>;
}

export interface MetricsPayload {
  instanceId: string;
  command: string;
  project: string;
  timestamp: string;
  loop: number;
  status: string;
  metrics: Record<string, number>;
  description: string;
  commit?: string;
}

export interface HttpMetricsReporterDeps {
  host: string;
  port: number;
  logger: Logger;
}

export class HttpMetricsReporter implements MetricsReporter {
  private readonly host: string;
  private readonly port: number;
  private readonly logger: Logger;

  constructor({ host, port, logger }: HttpMetricsReporterDeps) {
    this.host = host;
    this.port = port;
    this.logger = logger;
  }

  async ping(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path: "/api/metrics",
          method: "GET",
        },
        (res) => {
          res.resume();
          resolve();
        },
      );

      req.on("error", (err) => {
        reject(new Error(`Cannot reach metrics server at ${this.host}:${this.port}: ${err.message}`));
      });

      req.end();
    });
  }

  async report(payload: MetricsPayload): Promise<void> {
    const body = JSON.stringify(payload);

    return new Promise<void>((resolve) => {
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path: "/api/metrics",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          const detail = payload.description || payload.status || "";
          this.logger.info(`[metrics] loop=${payload.loop} status=${payload.status}${detail ? " — " + detail : ""}`);
          resolve();
        },
      );

      req.on("error", (err) => {
        this.logger.warn(`Metrics report failed: ${err.message}`);
        resolve();
      });

      req.write(body);
      req.end();
    });
  }
}
