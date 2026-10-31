export type SaveOutcome = Readonly<{ ok: true; version: string }> | Readonly<{ ok: false; reason: string }>;

export type PublishPlan<T> =
  | Readonly<{ kind: "released"; value: T; savedFirst: boolean }>
  | Readonly<{ kind: "blocked"; reason: string }>
  | Readonly<{ kind: "no-draft" }>;

/**
 * One click on Publish: if there are unsaved edits, save them first and
 * publish the version that save returned; a failed save stops here with its
 * reason, so nothing is released from a draft the seller did not mean.
 */
export async function saveThenPublish<T>(
  input: Readonly<{
    dirty: boolean;
    version: string | null;
    save: () => Promise<SaveOutcome>;
    release: (version: string) => Promise<T>;
  }>,
): Promise<PublishPlan<T>> {
  let version = input.version;
  let savedFirst = false;
  if (input.dirty) {
    const saved = await input.save();
    if (!saved.ok) return { kind: "blocked", reason: saved.reason };
    version = saved.version;
    savedFirst = true;
  }
  if (version === null) return { kind: "no-draft" };
  return { kind: "released", value: await input.release(version), savedFirst };
}

export type PublishPhase =
  | Readonly<{ phase: "idle" }>
  | Readonly<{ phase: "saving" }>
  | Readonly<{ phase: "publishing" }>
  | Readonly<{ phase: "published"; text: string }>
  | Readonly<{ phase: "failed"; text: string }>;

export type PublishLine = Readonly<{ text: string; role: "status" | "alert" }> | null;

/** The line beside the Publish button: polite while working and on success, an alert on failure. */
export function publishStatusView(
  state: PublishPhase,
  t: (key: string) => string,
): PublishLine {
  switch (state.phase) {
    case "idle":
      return null;
    case "saving":
      return { text: t("storefront.studioStates.publish.savingFirst"), role: "status" };
    case "publishing":
      return { text: t("storefront.studioStates.publish.publishing"), role: "status" };
    case "published":
      return { text: state.text, role: "status" };
    case "failed":
      return { text: state.text, role: "alert" };
  }
}

/**
 * What the online store is known to show. The Studio's config is the private
 * draft's view: with no saved draft it equals the live store, otherwise the live
 * state is not known here (null), because autosave never touches the live store.
 */
export function publishedActiveBaseline(
  input: Readonly<{ hasSavedDraft: boolean; isActive: boolean }>,
): boolean | null {
  return input.hasSavedDraft ? null : input.isActive;
}

/** The active/paused switch only changes the online store at the next Publish. */
export function activeWaitsForPublish(
  input: Readonly<{ published: boolean | null; current: boolean }>,
): boolean {
  return input.published === null || input.published !== input.current;
}
