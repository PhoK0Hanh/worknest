import "dotenv/config";
import { z } from "zod";

// Fail early on invalid configuration, without printing secret environment values.
const parsed = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_URL: z.url().default("http://localhost:3000"),
}).safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
}

export const config = parsed.data;
