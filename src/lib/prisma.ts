import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaOceanV2: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prismaOceanV2 ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaOceanV2 = prisma;
}

export default prisma;
