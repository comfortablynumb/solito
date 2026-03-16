import { UiServer } from "../ui/ui-server";
import { createRouteDispatcher } from "../ui/ui-routes";
import { createUiHandlers } from "../ui/ui-handlers";
import { InMemoryMetricsStore } from "../ui/metrics-store";
import { DefaultTsvParser } from "../ui/tsv-parser";
import { DefaultTsvRowTransformer } from "../ui/tsv-row-transformer";
import { FileSystem } from "../filesystem/filesystem";
import { Logger } from "../util/logger";

export function ignoreStopError(): void {
  // Intentionally empty: server.stop() rejection during shutdown is non-actionable
}

export interface UiCommandParams {
  host: string;
  port: number;
  cwd: string;
  filesystem: FileSystem;
  logger: Logger;
}

export async function executeUiCommand(params: UiCommandParams): Promise<number> {
  const { host, port, cwd, filesystem, logger } = params;
  const store = new InMemoryMetricsStore();
  const tsvParser = new DefaultTsvParser();
  const tsvRowTransformer = new DefaultTsvRowTransformer();

  const handlers = createUiHandlers({
    store,
    tsvParser,
    tsvRowTransformer,
    filesystem,
    logger,
    cwd,
  });

  const dispatcher = createRouteDispatcher(handlers);

  const server = new UiServer({
    dispatcher,
    host,
    port,
    logger,
  });

  await server.start();

  return new Promise<number>(() => {
    const onSignal = () => {
      logger.info("Shutting down Solardi UI...");
      server.stop().catch(ignoreStopError);
      process.exit(0);
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}
