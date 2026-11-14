import { connect } from "./db/store.js";
if (!process.env.MONGODB_URI)
  throw new Error("Set MONGODB_URI in your local ignored environment file");
const { store, client } = await connect(
  process.env.MONGODB_URI,
  process.env.MONGODB_DB,
);
try {
  await store.db.command({ ping: 1 });
  const counts = Object.fromEntries(
    await Promise.all(
      [
        "subjects",
        "modules",
        "resources",
        "concepts",
        "edges",
        "questions",
        "attempts",
        "lectures",
      ].map(async (n) => [n, await store.db.collection(n).countDocuments()]),
    ),
  );
  let vector: any = { available: false };
  try {
    const indexes = await store.db
      .collection("concepts")
      .listSearchIndexes("concept_embedding")
      .toArray();
    vector = {
      available: true,
      indexes: indexes.map((i: any) => ({
        name: i.name,
        status: i.status,
        queryable: i.queryable,
      })),
    };
  } catch {
    vector = { available: false, fallback: "cosine" };
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        database: store.db.databaseName,
        indexes: "created or already present",
        counts,
        vector,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
