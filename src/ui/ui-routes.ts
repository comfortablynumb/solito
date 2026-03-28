import { IncomingMessage, ServerResponse } from "http";
import { UiHandlers } from "./ui-handlers";

export interface RouteDispatcher {
  dispatch(req: IncomingMessage, res: ServerResponse): void;
}

interface Route {
  method: string;
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void;
}

interface PrefixRoute {
  method: string;
  prefix: string;
  handler: (req: IncomingMessage, res: ServerResponse, param: string) => void;
}

export function createRouteDispatcher(handlers: UiHandlers): RouteDispatcher {
  const exactRoutes: Route[] = [
    { method: "GET", path: "/", handler: handlers.dashboard },
    { method: "GET", path: "/api/metrics", handler: handlers.getAllMetrics },
    { method: "POST", path: "/api/metrics", handler: handlers.postMetrics },
    { method: "GET", path: "/api/instances", handler: handlers.getInstances },
    { method: "GET", path: "/api/commands", handler: handlers.getAvailableCommands },
  ];

  const prefixRoutes: PrefixRoute[] = [
    { method: "GET", prefix: "/api/instances/", handler: handlers.getMetricsByInstance },
    { method: "GET", prefix: "/api/metrics/", handler: handlers.getMetricsByCommand },
    { method: "GET", prefix: "/api/tsv/", handler: handlers.getTsv },
    { method: "GET", prefix: "/api/state/", handler: handlers.getState },
  ];

  return {
    dispatch(req, res) {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";

      if (tryExactRoute(exactRoutes, method, url, req, res)) return;

      if (tryPrefixRoute(prefixRoutes, method, url, req, res)) return;

      sendNotFound(res);
    },
  };
}

function tryExactRoute(
  routes: Route[], method: string, url: string, req: IncomingMessage, res: ServerResponse,
): boolean {
  const route = routes.find((r) => r.method === method && r.path === url);

  if (!route) return false;

  route.handler(req, res);
  return true;
}

function tryPrefixRoute(
  routes: PrefixRoute[], method: string, url: string, req: IncomingMessage, res: ServerResponse,
): boolean {
  for (const route of routes) {
    if (method !== route.method || !url.startsWith(route.prefix)) continue;

    const param = url.slice(route.prefix.length);

    if (param) {
      route.handler(req, res, param);
      return true;
    }
  }

  return false;
}

function sendNotFound(res: ServerResponse): void {
  const body = JSON.stringify({ error: "Not found" });
  res.writeHead(404, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
