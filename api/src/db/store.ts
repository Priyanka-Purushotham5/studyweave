import {
  MongoClient,
  type Db,
  type Document,
  GridFSBucket,
  ObjectId,
} from "mongodb";
export class Store {
  constructor(public db: Db) {}
  async all<T = any>(name: string, filter: Document = {}): Promise<T[]> {
    return (await this.db
      .collection(name)
      .find(filter, { projection: { _id: 0 } })
      .toArray()) as T[];
  }
  async get<T = Record<string, any>>(
    name: string,
    id: string,
  ): Promise<T | null> {
    return (await this.db
      .collection(name)
      .findOne({ id }, { projection: { _id: 0 } })) as T | null;
  }
  async put(name: string, row: any) {
    await this.db
      .collection(name)
      .replaceOne({ id: row.id }, row, { upsert: true });
    return row;
  }
  async saveFile(data: Buffer, filename: string, contentType: string) {
    const bucket = new GridFSBucket(this.db);
    const stream = bucket.openUploadStream(filename, {
      metadata: { contentType },
    });
    await new Promise<void>((resolve, reject) => {
      stream.once("finish", resolve);
      stream.once("error", reject);
      stream.end(data);
    });
    return stream.id.toHexString();
  }
  fileStream(id: string, start = 0, end?: number) {
    return new GridFSBucket(this.db).openDownloadStream(new ObjectId(id), {
      start,
      ...(end === undefined ? {} : { end }),
    });
  }
  async fileInfo(id: string) {
    return this.db.collection("fs.files").findOne({ _id: new ObjectId(id) });
  }
  async deleteFile(id: string) {
    await new GridFSBucket(this.db).delete(new ObjectId(id));
  }
  async indexes() {
    for (const n of [
      "subjects",
      "exams",
      "modules",
      "resources",
      "concepts",
      "edges",
      "questions",
      "attempts",
      "lectures",
      "corrections",
      "jobs",
      "cache",
      "counters",
    ])
      await this.db.collection(n).createIndex({ id: 1 }, { unique: true });
    await this.db
      .collection("resources")
      .createIndex({ moduleId: 1, hash: 1 }, { unique: true });
    await this.db
      .collection("attempts")
      .createIndex({ conceptId: 1, createdAt: -1 });
    await this.db
      .collection("cache")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }
}
export async function connect(uri: string, name = "studyweave") {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const store = new Store(client.db(name));
  await store.indexes();
  return { store, client };
}
