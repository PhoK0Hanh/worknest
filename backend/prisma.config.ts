import "dotenv/config";
import { defineConfig } from "prisma/config";

// CLI configuration only; the API does not connect to Neon during startup yet.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
