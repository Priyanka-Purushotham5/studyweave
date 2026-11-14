import { MongoClient } from "mongodb";
import { readFile } from "node:fs/promises";
import { ensureVectorIndex } from "./db/vectorIndex.js";
if (!process.env.MONGODB_URI)
  throw new Error(
    "MONGODB_URI required; keep credentials in your ignored environment file",
  );
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
try {
  await client.connect();
  const spec = JSON.parse(
    await readFile(
      new URL("../../deploy/atlas-vector-index.json", import.meta.url),
      "utf8",
    ),
  );
  const result = await ensureVectorIndex(
    client.db(process.env.MONGODB_DB || "studyweave").collection("concepts"),
    spec,
  );
  console.log(JSON.stringify(result));
} catch {
  console.error(
    "Vector index could not be verified. Check Atlas tier/permissions/index status; keep VECTOR_MODE=cosine. No cluster upgrade was attempted.",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
