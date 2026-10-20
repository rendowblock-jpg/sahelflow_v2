/**
 * @vitest-environment happy-dom
 */
/**
 * The orders list while a new search is loading — BEHAVIORAL evidence.
 *
 * Reported on Internal.45: searching makes the list "glitch and flake". Before this fix every
 * committed query changed the SWR key, the previous rows vanished and the table fell back to
 * its loading state until the answer arrived (slow on a small PC). The seller must keep seeing
 * the rows they had until the new ones are ready.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { useQueryState } from "nuqs";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { fetcher } from "@/lib/swr/fetcher";

import { useOrders } from "../use-orders";

vi.mock("@/lib/swr/fetcher", () => ({ fetcher: vi.fn() }));

const waiting = new Map<string, (value: unknown) => void>();

function answer(urlPart: string, ids: string[]) {
  const key = [...waiting.keys()].find((candidate) => candidate.includes(urlPart));
  if (!key) throw new Error(`no request waiting for ${urlPart}; waiting: ${[...waiting.keys()].join(" | ")}`);
  waiting.get(key)?.({
    orders: ids.map((id) => ({ id })),
    total: ids.length,
    page: 1,
    pageSize: 25,
    hasNextPage: false,
    sort: "createdAt.desc",
  });
  waiting.delete(key);
}

function Probe() {
  const { data, isLoading } = useOrders();
  const [, setQ] = useQueryState("q", { defaultValue: "", shallow: true });
  return (
    <div>
      <button type="button" onClick={() => void setQ("zz")}>
        search
      </button>
      <output data-testid="state">
        {isLoading ? "loading" : "ready"}:{(data?.orders ?? []).map((order) => order.id).join(",")}
      </output>
    </div>
  );
}

/** Let timers and promises run for real: SWR publishes its result on a later tick, not a microtask. */
async function pause(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function state() {
  return screen.getByTestId("state").textContent;
}

describe("useOrders while a new search loads", () => {
  beforeEach(() => {
    waiting.clear();
    vi.mocked(fetcher).mockImplementation(
      ((url: string) => new Promise((resolve) => waiting.set(url, resolve))) as never,
    );
  });

  it("keeps the previous rows on screen until the new ones arrive", async () => {
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <NuqsTestingAdapter hasMemory>
          <Probe />
        </NuqsTestingAdapter>
      </SWRConfig>,
    );
    await waitFor(() => expect([...waiting.keys()].some((key) => key.includes("/api/orders?page=1"))).toBe(true));
    answer("/api/orders?page=1", ["a", "b", "c"]);
    await waitFor(() => expect(state()).toBe("ready:a,b,c"));

    await act(async () => {
      fireEvent.click(screen.getByText("search"));
    });
    await waitFor(() => expect([...waiting.keys()].some((key) => key.includes("&q=zz"))).toBe(true));
    await pause();
    // The request for "zz" is in flight: the old rows must still be there, not an empty loading state.
    expect(state()).toBe("ready:a,b,c");

    answer("&q=zz", ["b"]);
    await waitFor(() => expect(state()).toBe("ready:b"));
  });
});
