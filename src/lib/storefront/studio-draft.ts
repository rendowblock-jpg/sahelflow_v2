import type { StorefrontConfig } from "./service";
import type { StorefrontSection, StorefrontSectionType } from "./studio-sections";
import { STOREFRONT_SECTION_TYPES } from "./studio-sections";
import type { StorefrontTheme } from "./presentation-types";
import { normalizeStorefrontTheme } from "./theme-normalize";

export interface StorefrontStudioDraft {
  name: string;
  slug: string;
  description: string;
  theme: StorefrontTheme;
  selectedProductIds: string[];
  isActive: boolean;
}

export function createStorefrontStudioDraft(config: StorefrontConfig): StorefrontStudioDraft {
  return {
    name: config.name,
    slug: config.slug,
    description: config.description ?? "",
    theme: normalizeStorefrontTheme(config.theme),
    selectedProductIds: [...config.productIds],
    isActive: config.isActive,
  };
}

export function storefrontDraftFingerprint(draft: StorefrontStudioDraft): string {
  return JSON.stringify(draft);
}

function withSections(
  draft: StorefrontStudioDraft,
  sections: readonly StorefrontSection[],
): StorefrontStudioDraft {
  return {
    ...draft,
    theme: {
      ...draft.theme,
      builder: {
        ...draft.theme.builder,
        composition: { ...draft.theme.builder.composition, sections },
      },
    },
  };
}

export function moveStorefrontSection(
  draft: StorefrontStudioDraft,
  id: string,
  direction: -1 | 1,
): StorefrontStudioDraft {
  const sections = [...draft.theme.builder.composition.sections];
  const source = sections.findIndex((section) => section.id === id);
  const target = source + direction;
  if (source < 0 || target < 0 || target >= sections.length) return draft;
  const [section] = sections.splice(source, 1);
  if (!section) return draft;
  sections.splice(target, 0, section);
  return withSections(draft, sections);
}

export function toggleStorefrontSection(draft: StorefrontStudioDraft, id: string): StorefrontStudioDraft {
  return withSections(draft, draft.theme.builder.composition.sections.map((section) =>
    section.id === id ? { ...section, enabled: !section.enabled } : section));
}

export function deleteStorefrontSection(draft: StorefrontStudioDraft, id: string): StorefrontStudioDraft {
  if (draft.theme.builder.composition.sections.length <= 1) return draft;
  return withSections(draft, draft.theme.builder.composition.sections.filter((section) => section.id !== id));
}

export function duplicateStorefrontSection(
  draft: StorefrontStudioDraft,
  id: string,
  newId: string,
): StorefrontStudioDraft {
  const sections = [...draft.theme.builder.composition.sections];
  const index = sections.findIndex((section) => section.id === id);
  if (index < 0 || sections.length >= 50) return draft;
  const source = sections[index];
  if (!source) return draft;
  sections.splice(index + 1, 0, {
    ...structuredClone(source),
    id: newId,
    blocks: source.blocks.map((block, blockIndex) => ({
      ...structuredClone(block),
      id: `${newId}-block-${blockIndex + 1}`,
    })),
  });
  return withSections(draft, sections);
}

export function addStorefrontSection(
  draft: StorefrontStudioDraft,
  id: string,
  preferredType?: StorefrontSectionType,
): StorefrontStudioDraft {
  const sections = draft.theme.builder.composition.sections;
  if (sections.length >= 50) return draft;
  const existing = new Set(sections.map((section) => section.type));
  const type = preferredType ?? STOREFRONT_SECTION_TYPES.find((candidate) => !existing.has(candidate)) ?? "media";
  return withSections(draft, [...sections, { id, type, enabled: true, settings: {}, blocks: [] }]);
}
