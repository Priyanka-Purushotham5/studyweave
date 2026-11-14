import { it, expect, vi } from "vitest";
import { ensureVectorIndex } from "../src/db/vectorIndex.js";
const spec = {
  name: "concept_embedding",
  type: "vectorSearch",
  definition: {
    fields: [
      {
        type: "vector",
        path: "embedding",
        numDimensions: 768,
        similarity: "cosine",
      },
    ],
  },
};
it("reuses a ready matching index without creating a duplicate", async () => {
  const createSearchIndex = vi.fn();
  const collection = {
    listSearchIndexes: () => ({
      toArray: async () => [
        {
          name: spec.name,
          status: "READY",
          queryable: true,
          latestDefinition: spec.definition,
        },
      ],
    }),
    createSearchIndex,
  };
  expect(await ensureVectorIndex(collection, spec)).toEqual({
    name: spec.name,
    created: false,
    status: "ready",
  });
  expect(createSearchIndex).not.toHaveBeenCalled();
});
it("creates a missing index and waits for queryability", async () => {
  let count = 0,
    clock = 0;
  const createSearchIndex = vi.fn(async () => spec.name);
  const collection = {
    listSearchIndexes: () => ({
      toArray: async () =>
        ++count === 1
          ? []
          : [
              {
                status: count === 2 ? "BUILDING" : "READY",
                queryable: count > 2,
              },
            ],
    }),
    createSearchIndex,
  };
  expect(
    (
      await ensureVectorIndex(collection, spec, {
        now: () => clock,
        wait: async (ms) => {
          clock += ms;
        },
      })
    ).created,
  ).toBe(true);
  expect(createSearchIndex).toHaveBeenCalledOnce();
});
it("fails visibly if the tier rejects search indexes", async () => {
  const collection = {
    listSearchIndexes: () => ({
      toArray: async () => {
        throw new Error("Unsupported stage");
      },
    }),
    createSearchIndex: vi.fn(),
  };
  await expect(ensureVectorIndex(collection, spec)).rejects.toThrow(
    "Unsupported",
  );
  expect(collection.createSearchIndex).not.toHaveBeenCalled();
});
it("does not silently alter a mismatched index", async () => {
  const collection = {
    listSearchIndexes: () => ({
      toArray: async () => [{ latestDefinition: { fields: [] } }],
    }),
    createSearchIndex: vi.fn(),
  };
  await expect(ensureVectorIndex(collection, spec)).rejects.toThrow(
    "different definition",
  );
  expect(collection.createSearchIndex).not.toHaveBeenCalled();
});
it("bounds index-build waiting and preserves the cosine option", async () => {
  let clock = 0;
  const collection = {
    listSearchIndexes: () => ({
      toArray: async () => [
        {
          latestDefinition: spec.definition,
          status: "BUILDING",
          queryable: false,
        },
      ],
    }),
    createSearchIndex: vi.fn(),
  };
  await expect(
    ensureVectorIndex(collection, spec, {
      timeoutMs: 10,
      pollMs: 5,
      now: () => clock,
      wait: async (ms) => {
        clock += ms;
      },
    }),
  ).rejects.toThrow("VECTOR_MODE=cosine");
});
