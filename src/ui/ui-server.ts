import * as http from "http";
import { RouteDispatcher } from "./ui-routes";
import { Logger } from "../util/logger";

export interface HttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface UiServerDeps {
  dispatcher: RouteDispatcher;
  host: string;
  port: number;
  logger: Logger;
}

export class UiServer implements HttpServer {
  private readonly dispatcher: RouteDispatcher;
  private readonly host: string;
  private readonly port: number;
  private readonly logger: Logger;
  private server: http.Server | null = null;

  constructor({ dispatcher, host, port, logger }: UiServerDeps) {
    this.dispatcher = dispatcher;
    this.host = host;
    this.port = port;
    this.logger = logger;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.dispatcher.dispatch(req, res);
      });

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        this.logger.info(`Solito UI running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }
}
