import { createRouteDispatcher } from "./ui-routes";
import { UiHandlers } from "./ui-handlers";
import { IncomingMessage, ServerResponse } from "http";

function createMockHandlers(): UiHandlers {
  return {
    dashboard: jest.fn(),
    getAllMetrics: jest.fn(),
    getMetricsByCommand: jest.fn(),
    getMetricsByInstance: jest.fn(),
    getInstances: jest.fn(),
    postMetrics: jest.fn(),
    getTsv: jest.fn(),
    getAvailableCommands: jest.fn(),
  };
}

function createMockReq(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage;
}

function createMockRes(): ServerResponse & { _status: number; _body: string } {
  const res = {
    _status: 0,
    _body: "",
    writeHead(status: number) { res._status = status; },
    end(body?: string) { res._body = body ?? ""; },
  };

  return res as unknown as ServerResponse & { _status: number; _body: string };
}

describe("RouteDispatcher", () => {
  it("routes GET / to dashboard", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.dashboard).toHaveBeenCalledWith(req, res);
  });

  it("routes GET /api/metrics to getAllMetrics", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/metrics");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getAllMetrics).toHaveBeenCalledWith(req, res);
  });

  it("routes POST /api/metrics to postMetrics", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("POST", "/api/metrics");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.postMetrics).toHaveBeenCalledWith(req, res);
  });

  it("routes GET /api/metrics/:command to getMetricsByCommand", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/metrics/quality");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getMetricsByCommand).toHaveBeenCalledWith(req, res, "quality");
  });

  it("routes GET /api/instances to getInstances", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/instances");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getInstances).toHaveBeenCalledWith(req, res);
  });

  it("routes GET /api/instances/:id to getMetricsByInstance", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/instances/abc-123");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getMetricsByInstance).toHaveBeenCalledWith(req, res, "abc-123");
  });

  it("routes GET /api/tsv/:command to getTsv", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/tsv/quality");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getTsv).toHaveBeenCalledWith(req, res, "quality");
  });

  it("returns 404 for unknown routes", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/unknown");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(res._status).toBe(404);
  });

  it("routes GET /api/commands to getAvailableCommands", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("GET", "/api/commands");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.getAvailableCommands).toHaveBeenCalledWith(req, res);
  });

  it("defaults method to GET and url to / when undefined", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = { method: undefined, url: undefined } as unknown as IncomingMessage;
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(handlers.dashboard).toHaveBeenCalledWith(req, res);
  });

  it("returns 404 for wrong method on known path", () => {
    const handlers = createMockHandlers();
    const dispatcher = createRouteDispatcher(handlers);
    const req = createMockReq("DELETE", "/api/metrics");
    const res = createMockRes();

    dispatcher.dispatch(req, res);

    expect(res._status).toBe(404);
  });
});
