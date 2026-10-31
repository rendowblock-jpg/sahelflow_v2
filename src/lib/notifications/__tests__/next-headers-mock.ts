/** Imports NOTHING on purpose: a vi.mock("next/headers") factory that imported i18n-server would wait for itself. */
export const cookieJar = new Map<string, string>();

export function nextHeadersMock() {
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) as string } : undefined),
    }),
    headers: async () => ({ get: () => undefined }),
  };
}
