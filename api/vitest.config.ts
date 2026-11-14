import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fresh CI workers otherwise race while downloading/renaming the same MongoDB
    // archive. Parallel HTTP/database operations inside each test remain enabled.
    fileParallelism: false,
  },
});
