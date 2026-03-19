import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let loaded = false;

function resolveFromRoot(...segments: string[]) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..", ...segments);
}

export function loadServerEnv() {
  if (loaded || process.env.VERCEL) {
    return;
  }

  loaded = true;

  for (const envPath of [
    resolveFromRoot("apps", "delivery-coach", ".env.local"),
    resolveFromRoot("apps", "delivery-coach", ".env"),
    resolveFromRoot(".env.local"),
    resolveFromRoot(".env")
  ]) {
    dotenv.config({ path: envPath });
  }
}
