import type { PersistedCoachThread, PersistedCreatorProject, RecentWorkItem } from "./types";

const MAX_RECENT_ITEMS = 8;
const MAX_PROJECTS = 12;
const MAX_THREADS = 12;

function scopedKey(scope: string, userId: string) {
  return `deckspert.${scope}.${userId}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }

    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listRecentWork(userId: string): RecentWorkItem[] {
  return readJson<RecentWorkItem[]>(scopedKey("recent-work", userId), []);
}

export function upsertRecentWork(userId: string, item: RecentWorkItem) {
  const current = listRecentWork(userId).filter((entry) => !(entry.pillar === item.pillar && entry.id === item.id));
  const next = [item, ...current]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, MAX_RECENT_ITEMS);

  writeJson(scopedKey("recent-work", userId), next);
}

export function listCreatorProjects(userId: string): PersistedCreatorProject[] {
  return readJson<PersistedCreatorProject[]>(scopedKey("creator-projects", userId), []);
}

export function getCreatorProject(userId: string, projectId: string) {
  return listCreatorProjects(userId).find((project) => project.id === projectId) ?? null;
}

export function upsertCreatorProject(userId: string, project: PersistedCreatorProject) {
  const current = listCreatorProjects(userId).filter((entry) => entry.id !== project.id);
  const next = [project, ...current]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, MAX_PROJECTS);

  writeJson(scopedKey("creator-projects", userId), next);
}

export function listCoachThreads(userId: string): PersistedCoachThread[] {
  return readJson<PersistedCoachThread[]>(scopedKey("coach-threads", userId), []);
}

export function getCoachThread(userId: string, threadId: string) {
  return listCoachThreads(userId).find((thread) => thread.id === threadId) ?? null;
}

export function upsertCoachThread(userId: string, thread: PersistedCoachThread) {
  const current = listCoachThreads(userId).filter((entry) => entry.id !== thread.id);
  const next = [thread, ...current]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, MAX_THREADS);

  writeJson(scopedKey("coach-threads", userId), next);
}
