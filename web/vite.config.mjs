import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.STUDYWEAVE_API_TARGET || "http://127.0.0.1:3000";
  return {
    server: { proxy: { "/api": target, "/healthz": target } },
    preview: { proxy: { "/api": target, "/healthz": target } },
  };
});
