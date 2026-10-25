/**
 * The one account store and sign-in service of this process. Pending sign-ins
 * and the token-refresh guard live in memory, so routes and the extraction
 * router must share these instances.
 */
import { db, shopContext } from "@/lib/db";
import { getOrCreateHostId, createSettingsHostIdStore } from "./host-id";
import { createSignInService } from "./sign-in";
import { createAccountStore, createSecretSeam, createSettingsIndexSeam } from "./store";
import { refreshTokenSet } from "./tokens";

let shared: ReturnType<typeof build> | null = null;

function build() {
  const context = { prisma: db, shop: shopContext };
  const store = createAccountStore({ secrets: createSecretSeam(context), index: createSettingsIndexSeam(context) });
  const hostStore = createSettingsHostIdStore(context);
  const signIn = createSignInService({ store, getHostId: () => getOrCreateHostId(hostStore) });
  /** A usable access token for an account, refreshed inside the expiry window. */
  const accessToken = (accountId: number) => store.usableAccessToken(accountId, (input) => refreshTokenSet({}, input));
  return { context, store, signIn, accessToken };
}

export function getOpenAiRuntime() {
  shared ??= build();
  return shared;
}
