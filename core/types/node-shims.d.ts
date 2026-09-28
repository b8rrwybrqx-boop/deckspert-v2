declare module "node:child_process" {
  export function execFileSync(command: string, args?: string[], options?: Record<string, unknown>): string;
}

declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: Record<string, unknown>): void;
  export function writeFileSync(path: string, data: unknown): void;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

/**
 * Minimal Buffer surface. This project sets tsconfig "types" to ["vite/client"]
 * only, so @types/node is deliberately not in scope and Node globals are
 * declared here by hand, as narrowly as the code actually needs them.
 */
interface NodeBufferLike extends Uint8Array {
  toString(encoding?: string): string;
}

declare const Buffer: {
  from(data: string, encoding?: string): NodeBufferLike;
  from(data: ArrayBufferLike | ArrayBufferView | ReadonlyArray<number>): NodeBufferLike;
};

declare module "node:module" {
  // Returns any to match how this was used before it had a declaration
  // (core/server/prisma-client.ts destructures the result).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createRequire(path: string): (id: string) => any;
}

declare const process:
  | {
      env: Record<string, string | undefined>;
    }
  | undefined;
