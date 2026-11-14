import { randomUUID } from "node:crypto";
import { Store } from "../db/store.js";
export class Jobs {
  private active = new Set<Promise<void>>();
  constructor(private s: Store) {}
  async enqueue(kind: string, run: () => Promise<void>, ownerId?: string) {
    const id = randomUUID();
    const owner = ownerId ? { ownerId } : {};
    await this.s.put("jobs", { id, kind, ...owner, status: "queued" });
    const p = new Promise<void>((resolve) => setImmediate(resolve)).then(
      async () => {
        await this.s.put("jobs", { id, kind, ...owner, status: "running" });
        try {
          await run();
          await this.s.put("jobs", { id, kind, ...owner, status: "done" });
        } catch (e) {
          await this.s.put("jobs", {
            id,
            kind,
            ...owner,
            status: "failed",
            error: e instanceof Error ? e.message : "Job failed",
          });
        }
      },
    );
    this.active.add(p);
    void p.finally(() => this.active.delete(p)).catch(() => {});
    return id;
  }
  async drain() {
    while (this.active.size) await Promise.all([...this.active]);
  }
  async recover() {
    const interrupted = await this.s.all("jobs", {
      kind: "extract",
      ownerId: { $exists: true },
      status: { $in: ["queued", "running"] },
    });
    await this.s.db.collection("resources").updateMany(
      {
        extractionStatus: "pending",
        id: { $in: interrupted.map((j) => j.ownerId) },
      },
      {
        $set: {
          extractionStatus: "unsupported",
          extractionError:
            "Worker restarted during extraction; source file retained",
        },
      },
    );
    await this.s.db.collection("lectures").updateMany(
      { status: { $in: ["queued", "running"] } },
      {
        $set: {
          status: "failed",
          error: "Worker restarted; upload the lecture again",
        },
      },
    );
    await this.s.db.collection("jobs").updateMany(
      { status: { $in: ["queued", "running"] } },
      {
        $set: {
          status: "failed",
          error: "Worker restarted; retry the operation",
        },
      },
    );
  }
}
