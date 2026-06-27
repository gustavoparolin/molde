import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCurrentUserId } from "../auth/requestContext.js";

export const isDatabaseConfigured =
  !!process.env.DATABASE_URL && process.env.NODE_ENV !== "test";

function makePrisma() {
  const adapter = new PrismaPg(process.env.DATABASE_URL ?? "");
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return base.$extends({
    query: {
      $allModels: {
        async create({ args, query }) {
          const userId = getCurrentUserId();
          if (userId) {
            const data = args.data as Record<string, unknown>;
            // Only set if the model has audit columns (they're String? so any write is safe)
            if (!("createdBy" in data) || data.createdBy == null) data.createdBy = userId;
            if (!("updatedBy" in data) || data.updatedBy == null) data.updatedBy = userId;
          }
          return query(args);
        },
        async update({ args, query }) {
          const userId = getCurrentUserId();
          if (userId) {
            const data = args.data as Record<string, unknown>;
            if (!("updatedBy" in data) || data.updatedBy == null) data.updatedBy = userId;
          }
          return query(args);
        },
        async upsert({ args, query }) {
          const userId = getCurrentUserId();
          if (userId) {
            const create = args.create as Record<string, unknown>;
            const update = args.update as Record<string, unknown>;
            if (!("createdBy" in create) || create.createdBy == null) create.createdBy = userId;
            if (!("updatedBy" in create) || create.updatedBy == null) create.updatedBy = userId;
            if (!("updatedBy" in update) || update.updatedBy == null) update.updatedBy = userId;
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedPrisma = ReturnType<typeof makePrisma>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrisma };

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
