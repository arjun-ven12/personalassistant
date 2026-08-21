/** Refuse integration tests unless the target is explicitly isolated for tests. */
export const safeTestDatabaseUrl = () => {
  if (!process.env.TEST_DATABASE_URL) {
    try {
      process.loadEnvFile?.(
        process.cwd().endsWith("/apps/api") ? ".env" : "apps/api/.env",
      );
    } catch {
      // An absent local env file leaves integration tests skipped.
    }
  }
  const value = process.env.TEST_DATABASE_URL;
  if (!value) return undefined;
  const test = new URL(value);
  const configured = process.env.DATABASE_URL;
  if (configured && new URL(configured).toString() === test.toString())
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  const databaseName = decodeURIComponent(test.pathname).replace(/^\//, "");
  const clearlyNamed = /(^|[_-])(test|testing|ci)([_-]|$)/i.test(databaseName);
  const separatelyHosted = configured
    ? new URL(configured).host !== test.host
    : false;
  if (!clearlyNamed && !separatelyHosted)
    throw new Error("Refusing database integration tests: use a test-named database or a distinct test host.");
  return value;
};
