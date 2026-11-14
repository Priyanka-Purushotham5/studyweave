export function config(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1–65535");
  if (!env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  const fake = env.AI_MODE === "fake";
  if (!fake && !env.AI_SERVICE_URL)
    throw new Error("AI_SERVICE_URL is required unless AI_MODE=fake");
  if (env.NODE_ENV === "production" && env.ENABLE_DEV_SEED === "true")
    throw new Error("Development seed endpoint must be disabled in production");
  return {
    port,
    uri: env.MONGODB_URI,
    db: env.MONGODB_DB ?? "studyweave",
    fake,
    aiUrl: env.AI_SERVICE_URL ?? "http://localhost:8001",
    origin: env.CORS_ORIGIN,
    enableSeed: env.ENABLE_DEV_SEED === "true",
    publicDemo: env.PUBLIC_DEMO === "true",
    teamMode: env.TEAM_MODE === "true",
  };
}
