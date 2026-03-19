import type { Plugin } from "vite";
import type { ApiRequest, ApiResponse } from "./_utils.js";

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

type RouteMatch = {
  handler: Handler;
  params?: Record<string, string>;
};

type RouteDefinition = {
  exact?: string;
  pattern?: RegExp;
  keys?: string[];
  loadHandler: () => Promise<{ default: Handler }>;
};

const routes: RouteDefinition[] = [
  { exact: "/api/coach", loadHandler: () => import("./coach") },
  { exact: "/api/coach-thread", loadHandler: () => import("./coach-thread") },
  { exact: "/api/creator-extract", loadHandler: () => import("./creator-extract") },
  { exact: "/api/creator-generate", loadHandler: () => import("./creator-generate") },
  { exact: "/api/creator-project", loadHandler: () => import("./creator-project") },
  { exact: "/api/creator-revise", loadHandler: () => import("./creator-revise") },
  { exact: "/api/delivery/upload-token", loadHandler: () => import("./delivery-upload-token") },
  { exact: "/api/delivery/jobs", loadHandler: () => import("./delivery-jobs") },
  { pattern: /^\/api\/delivery\/jobs\/([^/]+)$/, keys: ["jobId"], loadHandler: () => import("./delivery-job") },
  { pattern: /^\/api\/delivery\/jobs\/([^/]+)\/start$/, keys: ["jobId"], loadHandler: () => import("./delivery-job-start") },
  { pattern: /^\/api\/delivery\/jobs\/([^/]+)\/retry$/, keys: ["jobId"], loadHandler: () => import("./delivery-job-retry") },
  { exact: "/api/evaluate", loadHandler: () => import("./evaluate") },
  { exact: "/api/workspace-recent", loadHandler: () => import("./workspace-recent") },
  { exact: "/api/uploads", loadHandler: () => import("./uploads") }
];

function matchRoute(url: string): RouteMatch | null {
  for (const route of routes) {
    if (route.exact && route.exact === url) {
      return {
        handler: async (req, res) => {
          const loaded = await route.loadHandler();
          return loaded.default(req, res);
        }
      };
    }

    if (route.pattern) {
      const match = url.match(route.pattern);
      if (match) {
        const params = Object.fromEntries((route.keys ?? []).map((key, index) => [key, match[index + 1] ?? ""]));
        return {
          handler: async (req, res) => {
            const loaded = await route.loadHandler();
            return loaded.default(req, res);
          },
          params
        };
      }
    }
  }

  return null;
}

async function readBody(req: any): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk: unknown) => {
      raw += String(chunk);
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export function deckspertApiPlugin(): Plugin {
  return {
    name: "deckspert-api-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const request = req as any;
        const response = res as any;
        const url = request.url ? String(request.url).split("?")[0] : "";
        const routeMatch = matchRoute(url);

        if (!routeMatch) {
          next();
          return;
        }

        try {
          const body = await readBody(request);
          const apiResponse: ApiResponse = {
            status(code: number) {
              response.statusCode = code;
              return apiResponse;
            },
            json(payload: unknown) {
              response.statusCode = response.statusCode || 200;
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(payload));
            }
          };

          await routeMatch.handler(
            { method: request.method, body, params: routeMatch.params, headers: request.headers, raw: request },
            apiResponse
          );
        } catch (error) {
          console.error("[Deckspert][API]", {
            route: url,
            error: error instanceof Error ? error.message : error
          });
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown server error" }));
        }
      });
    }
  };
}
