import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const prismaClientPkg = require("../../apps/delivery-coach/node_modules/.prisma/client/index.js");

export const PrismaClient = prismaClientPkg.PrismaClient;
export const Prisma = prismaClientPkg.Prisma;
export const DeliveryJobStatus = prismaClientPkg.DeliveryJobStatus;
export const DerivedAssetType = prismaClientPkg.DerivedAssetType;

export default prismaClientPkg;
