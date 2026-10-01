import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

type PrismaClientProxy = { [K in keyof PrismaClient]: PrismaClient[K] };

export const prisma: PrismaClientProxy = new Proxy({} as PrismaClientProxy, {
  get(_target, property, receiver) {
    const cache = globalThis as unknown as { prisma?: PrismaClient };
    if (!cache.prisma) cache.prisma = createClient();
    return Reflect.get(cache.prisma, property, receiver);
  },
});
