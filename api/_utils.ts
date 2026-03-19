export type ApiRequest = {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  raw?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
};

export function ensureMethod(req: ApiRequest, res: ApiResponse, method: string): boolean {
  if (req.method !== method) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return false;
  }

  return true;
}

export function readJsonBody<T>(req: ApiRequest): T {
  if (typeof req.body === "string") {
    return JSON.parse(req.body) as T;
  }

  return (req.body ?? {}) as T;
}

export function readHeader(req: ApiRequest, name: string): string | null {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

export function readParam(req: ApiRequest, name: string): string | null {
  const direct = req.params?.[name];
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const queryValue = req.query?.[name];
  if (Array.isArray(queryValue)) {
    return queryValue[0] ?? null;
  }

  return typeof queryValue === "string" && queryValue.length > 0 ? queryValue : null;
}
