import { describe, expect, it } from "vitest";
import {
  applyResults,
  enqueue,
  forOwner,
  parseQueue,
  stampState,
  type QueuedStamp,
} from "./stamp-queue";

const q = (over: Partial<QueuedStamp>): QueuedStamp => ({
  clientId: "c1",
  action: "in",
  at: "2026-11-13T07:00:00.000Z",
  organizationId: "o1",
  ...over,
});

describe("stamp queue", () => {
  it("parses stored queues defensively", () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue("ikke json")).toEqual([]);
    expect(parseQueue(JSON.stringify([q({}), { junk: true }]))).toEqual([q({})]);
  });

  it("enqueues in order and ignores a repeated client id", () => {
    const a = enqueue([], q({}));
    const b = enqueue(a, q({ clientId: "c2", action: "out", at: "2026-11-13T15:00:00.000Z" }));
    expect(enqueue(b, q({})).map((x) => x.clientId)).toEqual(["c1", "c2"]);
  });

  it("drops synced and rejected items, keeps the ones that failed on the network", () => {
    const queue = [q({}), q({ clientId: "c2", action: "out" }), q({ clientId: "c3" })];
    const { remaining, rejected } = applyResults(queue, [
      { clientId: "c1", status: "ok" },
      { clientId: "c2", status: "rejected", reason: "not_in" },
    ]);
    expect(remaining.map((x) => x.clientId)).toEqual(["c3"]);
    expect(rejected).toEqual([{ clientId: "c2", reason: "not_in" }]);
  });

  it("derives the shown state from the server state and the pending queue", () => {
    expect(stampState({ openSince: null }, [], "o1")).toEqual({
      in: false,
      since: null,
      pending: 0,
    });
    expect(stampState({ openSince: null }, [q({})], "o1")).toEqual({
      in: true,
      since: "2026-11-13T07:00:00.000Z",
      pending: 1,
    });
    const both = [q({}), q({ clientId: "c2", action: "out" })];
    expect(stampState({ openSince: null }, both, "o1")).toEqual({
      in: false,
      since: null,
      pending: 2,
    });
    // Items of another organization do not count.
    expect(
      stampState({ openSince: "x" }, [q({ action: "out", organizationId: "o2" })], "o1"),
    ).toEqual({
      in: true,
      since: "x",
      pending: 0,
    });
  });

  it("belongs to the employee who stamped: another user on the same device does not send it", () => {
    const mine = q({ clientId: "a", employeeId: "e1" });
    const theirs = q({ clientId: "b", employeeId: "e2" });
    const legacy = q({ clientId: "c" });
    expect(forOwner([mine, theirs, legacy], "o1", "e1").map((x) => x.clientId)).toEqual(["a", "c"]);
    expect(stampState({ openSince: null }, [theirs], "o1", "e1")).toEqual({
      in: false,
      since: null,
      pending: 0,
    });
  });
});
