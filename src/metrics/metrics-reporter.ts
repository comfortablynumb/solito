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
  spec?: string;
}

export interface HttpMetricsReporterDeps {
  baseUrl: string;
  logger: Logger;
}

export class HttpMetricsReporter implements MetricsReporter {
  private readonly baseUrl: string;
  private readonly host: string;
  private readonly port: number;
  private readonly logger: Logger;

  constructor({ baseUrl, logger }: HttpMetricsReporterDeps) {
    this.baseUrl = baseUrl;
    const parsed = this.parseBaseUrl(baseUrl);
    this.host = parsed.host;
    this.port = parsed.port;
    this.logger = logger;
  }

  private parseBaseUrl(baseUrl: string): { host: string; port: number } {
    const parts = baseUrl.split(":");

    if (parts.length < 2) {
      return { host: baseUrl, port: 80 };
    }

    const port = parseInt(parts[parts.length - 1], 10);
    const host = parts.slice(0, -1).join(":");
    return { host, port: isNaN(port) ? 80 : port };
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
        reject(new Error(`Cannot reach metrics server at ${this.baseUrl}: ${err.message}`));
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
