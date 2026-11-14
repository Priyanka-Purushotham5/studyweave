import { MongoClient } from "../../api/node_modules/mongodb/lib/index.js";
import { readFile } from "node:fs/promises";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI required");
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const spec = JSON.parse(
    await readFile(new URL("../atlas-vector-index.json", import.meta.url)),
  );
  console.log(
    await client
      .db(process.env.MONGODB_DB || "studyweave")
      .collection("concepts")
      .createSearchIndex(spec),
  );
} finally {
  await client.close();
}
