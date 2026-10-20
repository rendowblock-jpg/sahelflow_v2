/**
 * @vitest-environment happy-dom
 */
/**
 * The shared list search box — BEHAVIORAL evidence, with the real `nuqs` library.
 *
 * Reported on Internal.45 (Founder, 20 Oct): "when you try to search it starts glitching and
 * flaking and doesn't work", on every list page. What the seller must be able to rely on:
 * what they typed stays in the box, a committed search never rewrites it, a clear-all from
 * outside still empties it, and there is ONE clear button, not two.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { useQueryState } from "nuqs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { ListSearchInput } from "../list-search-input";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

/** What an "everything" button elsewhere on the page (the clear-all chip) does to the URL. */
function ClearAllChip() {
  const [, setQ] = useQueryState("q");
  return (
    <button type="button" onClick={() => void setQ(null)}>
      clear-all
    </button>
  );
}

function mount(initialSearch = "") {
  const urls: string[] = [];
  render(
    <NuqsTestingAdapter
      searchParams={initialSearch}
      hasMemory
      onUrlUpdate={(event) => urls.push(event.queryString)}
    >
      <ListSearchInput placeholder="Search" />
      <ClearAllChip />
    </NuqsTestingAdapter>,
  );
  return { urls, box: () => screen.getByRole("searchbox") as HTMLInputElement };
}

/**
 * Advance the clock the way a real screen lives it: in small steps, with React free to render between them.
 * One big jump would run the debounce and the URL write inside a single `act`, and the commit's re-render
 * (where the old code emptied the box) would never get a turn.
 */
async function wait(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 10) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }
}

async function type(box: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.change(box, { target: { value } });
  });
}

describe("ListSearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps what the seller typed when the pause commits it to the URL", async () => {
    const { box, urls } = mount();
    await type(box(), "06");
    await wait(400);
    expect(urls.at(-1)).toBe("?q=06&page=1");
    expect(box().value).toBe("06");
  });

  it("keeps the box intact when the next characters arrive right after a commit", async () => {
    const { box, urls } = mount();
    await type(box(), "0");
    await wait(320);
    expect(box().value).toBe("0");
    await type(box(), "06");
    await wait(20);
    expect(box().value).toBe("06");
    await type(box(), "066");
    await wait(400);
    expect(box().value).toBe("066");
    expect(urls.at(-1)).toBe("?q=066&page=1");
  });

  it("starts with the search already in the URL", async () => {
    const { box } = mount("?q=abc");
    expect(box().value).toBe("abc");
  });

  it("empties the box when something outside clears the search", async () => {
    const { box } = mount("?q=abc");
    expect(box().value).toBe("abc");
    await act(async () => {
      fireEvent.click(screen.getByText("clear-all"));
    });
    await wait(50);
    expect(box().value).toBe("");
  });

  it("empties the box and the URL with its own clear button", async () => {
    const { box, urls } = mount();
    await type(box(), "abc");
    await wait(400);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "common.clearSearch" }));
    });
    await wait(50);
    expect(box().value).toBe("");
    expect(urls.at(-1)).not.toContain("q=");
  });

  it("draws one clear button: the browser's own is switched off", async () => {
    const { box } = mount();
    expect(box().className).toContain("[&::-webkit-search-cancel-button]:hidden");
    expect(box().className).toContain("[&::-webkit-search-decoration]:hidden");
  });
});
