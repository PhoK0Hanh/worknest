export function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const details = error as Record<string, unknown>;
  if (details.code === "P2002" || details.code === "23505" || details.originalCode === "23505" || details.kind === "UniqueConstraintViolation") return true;
  // Prisma driver adapters may wrap the PostgreSQL error several levels deep.
  return [details.meta, details.driverAdapterError, details.cause].some(value => isUniqueViolation(value, depth + 1));
}
