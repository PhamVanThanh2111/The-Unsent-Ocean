import { PrismaClient } from "@prisma/client";
import { Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prismaOceanPostgres: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "";

  // When connecting to NeonDB (*.neon.tech), use Neon Serverless Driver Adapter
  // so Prisma works seamlessly on both Cloudflare Workers (Edge) and Node.js
  if (
    connectionString.includes("neon.tech") &&
    !connectionString.includes("YOUR_PASSWORD")
  ) {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaNeon(pool);
    return new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma =
  globalForPrisma.prismaOceanPostgres ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaOceanPostgres = prisma;
}

export default prisma;
