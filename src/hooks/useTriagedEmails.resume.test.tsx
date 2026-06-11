// Verifies the PWA-resume failure path in useTriagedEmails:
//  1. a failed first fetch sets loadFailed (so EmailView won't treat the empty
//     list as "inbox empty" and auto-run a 90s triage)
//  2. the hook auto-retries with backoff and recovers once the network is back
//  3. a successful fetch clears loadFailed
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// In-test switch: when true, supabase queries reject like a dead radio.
let networkDown = true;
const rows: any[] = [
  {
    id: "1",
    nylas_message_id: "m1",
    nylas_thread_id: null,
    from_address: "a@b.c",
    from_name: "A",
    subject: "hi",
    received_at: new Date().toISOString(),
    is_unread: true,
    category: "urgent",
    priority_score: 5,
    ai_summary: null,
    ai_reason: null,
    processed_at: null,
    replied_at: null,
    snoozed_until: null,
  },
];

function queryResult() {
  if (networkDown) return Promise.reject(new TypeError("Failed to fetch"));
  return Promise.resolve({ data: rows, error: null });
}

// Thenable query builder — every chained filter returns itself, awaiting it
// resolves/rejects like the real PostgREST builder.
function makeBuilder() {
  const b: any = {};
  for (const m of ["select", "gte", "gt", "or", "order", "limit", "eq", "update", "insert", "delete"]) {
    b[m] = () => b;
  }
  b.then = (res: any, rej: any) => queryResult().then(res, rej);
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => makeBuilder(),
    channel: () => ({ on: () => ({ subscribe: () => ({ state: "joined" }) }) }),
    removeChannel: () => {},
    functions: { invoke: vi.fn() },
  },
}));

import { useTriagedEmails } from "./useTriagedEmails";

describe("useTriagedEmails resume behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    networkDown = true;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags loadFailed on fetch failure instead of reporting an empty inbox", async () => {
    const { result } = renderHook(() => useTriagedEmails());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.loadFailed).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.emails).toEqual([]);
  });

  it("auto-retries with backoff and recovers when the network comes back", async () => {
    const { result } = renderHook(() => useTriagedEmails());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // first fetch fails
    });
    expect(result.current.loadFailed).toBe(true);

    networkDown = false; // radio woke up
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100); // first backoff retry (2s)
    });

    expect(result.current.loadFailed).toBe(false);
    expect(result.current.emails).toHaveLength(1);
    expect(result.current.emails[0].subject).toBe("hi");
  });

  it("keeps loadFailed=true after exhausting retries while offline", async () => {
    const { result } = renderHook(() => useTriagedEmails());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100); // initial failure
      await vi.advanceTimersByTimeAsync(2_100); // retry 1 (2s) fails
      await vi.advanceTimersByTimeAsync(4_100); // retry 2 (4s) fails
      await vi.advanceTimersByTimeAsync(8_100); // retry 3 (8s) fails
      await vi.advanceTimersByTimeAsync(20_000); // no further retries
    });
    expect(result.current.loadFailed).toBe(true);
    expect(result.current.emails).toEqual([]);
  });
});
