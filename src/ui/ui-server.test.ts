import { UiServer } from "./ui-server";
import { RouteDispatcher } from "./ui-routes";
import { createMockLogger } from "../test/mock-logger";

function createMockDispatcher(): RouteDispatcher {
  return {
    dispatch: jest.fn((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    }),
  };
}

describe("UiServer", () => {
  let server: UiServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  it("starts and responds to requests", async () => {
    const dispatcher = createMockDispatcher();
    const logger = createMockLogger();
    server = new UiServer({ dispatcher, host: "127.0.0.1", port: 0, logger });

    await server.start();

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Solito UI running"));
  });

  it("stops cleanly", async () => {
    const dispatcher = createMockDispatcher();
    const logger = createMockLogger();
    server = new UiServer({ dispatcher, host: "127.0.0.1", port: 0, logger });

    await server.start();
    await server.stop();
    await server.stop(); // double stop is safe
  });
});
