import { useEffect, useState } from "react";

import { postJson } from "../api";
import type { RecentWorkItem } from "../workspace/types";

export function useRecentWork(userId: string | undefined, getRequestHeaders?: () => Promise<Record<string, string>>) {
  const [items, setItems] = useState<RecentWorkItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setItems([]);
      return;
    }

    void (getRequestHeaders ? getRequestHeaders() : Promise.resolve({}))
      .then((headers) => postJson<{ items: RecentWorkItem[] }>("/api/workspace-recent", {}, { headers }))
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, getRequestHeaders]);

  return items;
}
