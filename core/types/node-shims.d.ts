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

declare const Buffer: {
  from(data: string, encoding?: string): unknown;
};

declare const process:
  | {
      env: Record<string, string | undefined>;
    }
  | undefined;
