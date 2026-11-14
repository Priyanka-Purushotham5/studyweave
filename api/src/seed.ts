import { connect } from "./db/store.js";
import { seed } from "./services/seed.js";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
const { store, client } = await connect(
  process.env.MONGODB_URI,
  process.env.MONGODB_DB,
);
try {
  await seed(store);
  console.log("Demo seed loaded");
} finally {
  await client.close();
}
