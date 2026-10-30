import { act } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { useEffect, type ReactElement } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { vi } from "vitest";

import { render } from "@/test-utils/render";

type Mutate = ReturnType<typeof useSWRConfig>["mutate"];
const bound: { mutate: Mutate | null } = { mutate: null };
const capture = (mutate: Mutate) => {
  bound.mutate = mutate;
};

/** Hands the SWR cache of the mounted list to the test, so a test can ask for a refresh the way a focus or a bulk action would. */
function MutateProbe({ onReady }: { onReady: (mutate: Mutate) => void }) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    onReady(mutate);
  }, [mutate, onReady]);
  return null;
}

export interface FetchAnswer {
  status: number;
  body: unknown;
}

/** Every fetch gets the current answer, so a test can flip it between ok and 500 without remounting. */
export function stubFetch(answer: () => FetchAnswer) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      calls.push(String(url));
      const { status, body } = answer();
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

export function mountList(ui: ReactElement) {
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <MutateProbe onReady={capture} />
        {ui}
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}

/** Revalidates every list key that is mounted. A failed answer lands in the hook as `error` while the rows stay. */
export async function refreshLists() {
  await act(async () => {
    await bound.mutate?.(() => true).catch(() => undefined);
  });
}
