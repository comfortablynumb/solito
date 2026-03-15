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

  it("rejects on server error during start", async () => {
    const dispatcher = createMockDispatcher();
    const logger = createMockLogger();
    // Use an invalid port to trigger error
    server = new UiServer({ dispatcher, host: "127.0.0.1", port: 0, logger });

    await server.start();

    // Start a second server on the same port to trigger EADDRINUSE
    const server2 = new UiServer({
      dispatcher,
      host: "127.0.0.1",
      port: (server as unknown as { server: { address: () => { port: number } } }).server.address().port,
      logger,
    });

    await expect(server2.start()).rejects.toThrow();
    await server2.stop();
  });

  it("dispatches requests to the route dispatcher", async () => {
    const dispatcher = createMockDispatcher();
    const logger = createMockLogger();
    server = new UiServer({ dispatcher, host: "127.0.0.1", port: 0, logger });

    await server.start();

    const addr = (server as unknown as { server: { address: () => { port: number } } }).server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    const body = await res.text();

    expect(body).toBe("ok");
    expect(dispatcher.dispatch).toHaveBeenCalled();
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
