import {
  Ban,
  ChartNoAxesColumn,
  CircleAlert,
  FileText,
  ImageIcon,
  MapPin,
  Mic,
  Music,
  Sticker,
  UserRound,
  Video,
  SmilePlus,
} from "lucide-react";

import type { MessagePreview, MessagePreviewIcon } from "@/lib/inbox/message-preview";

const GLYPHS = {
  image: ImageIcon,
  video: Video,
  mic: Mic,
  audio: Music,
  document: FileText,
  sticker: Sticker,
  contact: UserRound,
  location: MapPin,
  poll: ChartNoAxesColumn,
  reaction: SmilePlus,
  deleted: Ban,
  unavailable: CircleAlert,
} as const satisfies Record<MessagePreviewIcon, unknown>;

/** The icon of a message preview (decorative: the label next to it carries the meaning). */
export function MessagePreviewGlyph({
  icon,
  className,
}: {
  icon: MessagePreviewIcon | null;
  className?: string;
}) {
  if (!icon) return null;
  const Glyph = GLYPHS[icon];
  return <Glyph className={className} aria-hidden="true" />;
}

/**
 * The placeholder a bubble shows when it has no text and nothing else to draw:
 * the same icon and label as the conversation list, never an empty pill.
 */
export function MessagePreviewPlaceholder({ preview }: { preview: MessagePreview }) {
  return (
    <div
      data-message-placeholder={preview.kind}
      className="flex items-center gap-2 text-sm font-medium"
    >
      <MessagePreviewGlyph icon={preview.icon} className="size-4 shrink-0" />
      <span>{preview.label ?? preview.text}</span>
    </div>
  );
}
