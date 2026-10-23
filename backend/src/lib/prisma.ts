import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

let client: PrismaClient | undefined;

export function getPrisma() {
  // Create one connection pool lazily; health and Firebase-only routes do not need Neon.
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Database chưa được cấu hình.");
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }),
    });
  }
  return client;
}

export async function disconnectDatabase() {
  await client?.$disconnect();
  client = undefined;
}
