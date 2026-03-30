import { PrismaClient } from "./prisma-client.js";
import { loadServerEnv } from "./loadEnv.js";
import type { PrismaClient as PrismaClientType } from "@prisma/client";

loadServerEnv();

declare global {
  // eslint-disable-next-line no-var
  var __deliveryPrisma: PrismaClientType | undefined;
}

export const prisma =
  global.__deliveryPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__deliveryPrisma = prisma;
}
