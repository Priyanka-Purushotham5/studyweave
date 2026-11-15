import { config } from "./config.js";
import { connect } from "./db/store.js";
import { FakeAiClient, HttpAiClient } from "./ai/aiClient.js";
import { createApp } from "./app.js";
import { AtlasNeighborFinder } from "./services/neighbors.js";
const c = config();
const { store, client } = await connect(c.uri, c.db, {
  readOnly: c.publicDemo,
});
const { app, jobs } = createApp(
  store,
  c.fake ? new FakeAiClient() : new HttpAiClient(c.aiUrl),
  {
    ...c,
    finder:
      process.env.VECTOR_MODE === "atlas"
        ? new AtlasNeighborFinder(store.db)
        : undefined,
  },
);
if (!c.publicDemo) await jobs.recover();
const server = app.listen(c.port, process.env.HOST ?? "0.0.0.0", () =>
  console.log(`StudyNova API listening on ${c.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close(async () => {
      await jobs.drain();
      await client.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000).unref();
  });
