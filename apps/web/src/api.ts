export async function postJson<T>(url: string, payload: unknown, init?: RequestInit): Promise<T> {
  return requestJson<T>(url, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    body: JSON.stringify(payload)
  });
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    let details = "";

    try {
      const errorBody = await response.json();
      if (errorBody && typeof errorBody === "object" && "error" in errorBody) {
        details = String(errorBody.error);
      }
    } catch {
      try {
        details = await response.text();
      } catch {
        details = "";
      }
    }

    throw new Error(details ? `Request failed with ${response.status}: ${details}` : `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
