/**
 * Conversation transcript formats for the Agents workspace: plain text for the
 * clipboard and a Markdown document for export. Pure functions — the UI owns
 * the clipboard/download side effects and the localized labels.
 */

export interface TranscriptMessage {
  role: string;
  content: string;
  createdAt?: string | null;
}

export interface TranscriptLabels {
  you: string;
  agent: string;
}

function speaker(role: string, labels: TranscriptLabels): string {
  return role === "assistant" ? labels.agent : labels.you;
}

function spoken(messages: readonly TranscriptMessage[]): TranscriptMessage[] {
  return messages.filter((message) => message.content.trim().length > 0);
}

/** "Speaker:\ncontent" blocks separated by a blank line. */
export function formatTranscriptText(
  messages: readonly TranscriptMessage[],
  labels: TranscriptLabels,
): string {
  return spoken(messages)
    .map(
      (message) =>
        `${speaker(message.role, labels)}:\n${message.content.trim()}`,
    )
    .join("\n\n");
}

/**
 * A self-contained Markdown document. Assistant turns are already Markdown
 * and are kept verbatim; seller turns are quoted so their text can never be
 * read as headings or lists of the document itself.
 */
export function formatTranscriptMarkdown(
  title: string,
  messages: readonly TranscriptMessage[],
  labels: TranscriptLabels,
  exportedAt: Date = new Date(),
): string {
  const heading = title.trim().replace(/\s+/g, " ") || labels.agent;
  const body = spoken(messages).map((message) => {
    const content = message.content.trim();
    const text =
      message.role === "assistant"
        ? content
        : content
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n");
    return `### ${speaker(message.role, labels)}\n\n${text}`;
  });
  return [
    `# ${heading}`,
    `_${exportedAt.toISOString().slice(0, 16).replace("T", " ")} UTC_`,
    ...body,
  ].join("\n\n") + "\n";
}

/** A portable file name: letters/digits of any script, dashes, `.md`. */
export function transcriptFileName(title: string, exportedAt: Date = new Date()): string {
  const slug = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const day = exportedAt.toISOString().slice(0, 10);
  return `${slug || "sahelflow-conversation"}-${day}.md`;
}
