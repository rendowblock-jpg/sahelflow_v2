"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";
import { Check, Square } from "lucide-react";

import {
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownTableAlign,
} from "@/components/ai/markdown/parse-markdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * XSS-safe markdown surface for assistant messages.
 *
 * Tokens from the pure parser map 1:1 onto React elements — raw model
 * HTML can only ever become literal text. Links open externally with
 * `rel="noopener noreferrer nofollow"` and are protocol-allowlisted by the
 * parser; code runs LTR inside RTL conversations.
 */

function inlineNodes(
  tokens: MarkdownInline[],
  keyPrefix: string,
): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}.${index}`;
    switch (token.kind) {
      case "text":
        return token.text;
      case "code":
        return (
          <code
            key={key}
            dir="ltr"
            className="rounded-md border bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {token.text}
          </code>
        );
      case "strong":
        return <strong key={key}>{inlineNodes(token.children, key)}</strong>;
      case "emphasis":
        return <em key={key}>{inlineNodes(token.children, key)}</em>;
      case "delete":
        return <del key={key}>{inlineNodes(token.children, key)}</del>;
      case "link":
        if (!token.safe) {
          // Unsafe scheme (javascript:, data:, …) — plain text, never an anchor.
          return <span key={key}>{token.text}</span>;
        }
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            dir="auto"
            className="font-medium text-primary underline underline-offset-2 hover:underline"
          >
            {token.text}
          </a>
        );
      default:
        return null;
    }
  });
}

const HEADING_TAG = {
  1: "h3",
  2: "h4",
  3: "h5",
  4: "h6",
} as const;

const HEADING_CLASS = {
  1: "text-base font-semibold",
  2: "text-sm font-semibold",
  3: "text-sm font-semibold",
  4: "text-sm font-medium",
} as const;

function alignClass(align: MarkdownTableAlign): string | undefined {
  if (align === "center") return "text-center";
  if (align === "end") return "text-end";
  return "text-start";
}

function blockNode(block: MarkdownBlock, key: string): ReactNode {
  switch (block.kind) {
    case "heading": {
      const Tag = HEADING_TAG[block.level];
      return (
        <Tag key={key} className={cn("tracking-tight", HEADING_CLASS[block.level])}>
          {inlineNodes(block.children, key)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} dir="auto" className="break-words">
          {block.lines.map((line, lineIndex) => (
            <Fragment key={`${key}.line.${lineIndex}`}>
              {lineIndex > 0 ? <br /> : null}
              {inlineNodes(line, `${key}.line.${lineIndex}`)}
            </Fragment>
          ))}
        </p>
      );
    case "code":
      return (
        <pre
          key={key}
          dir="ltr"
          className="overflow-x-auto rounded-lg border bg-muted/60 px-3 py-2.5 text-xs leading-5"
        >
          <code className="font-mono">
            {block.language ? (
              <span data-ai-code-language={block.language} className="sr-only">
                {block.language}
              </span>
            ) : null}
            {block.lines.join("\n")}
          </code>
        </pre>
      );
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag
          key={key}
          dir="auto"
          className={cn(
            "ms-5 space-y-1",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item, itemIndex) => {
            const itemKey = `${key}.item.${itemIndex}`;
            if (item.task) {
              return (
                <li key={itemKey} className="list-none -ms-5 flex items-start gap-2">
                  {item.task.checked ? (
                    <Check
                      className="mt-1 size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <Square
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      item.task.checked && "text-muted-foreground line-through",
                    )}
                  >
                    {inlineNodes(item.children, itemKey)}
                  </span>
                </li>
              );
            }
            return <li key={itemKey}>{inlineNodes(item.children, itemKey)}</li>;
          })}
        </ListTag>
      );
    }
    case "table":
      return (
        <div
          key={key}
          className="w-full overflow-x-auto overscroll-x-contain rounded-lg border"
        >
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                {block.header.map((cell, cellIndex) => (
                  <TableHead
                    key={`${key}.th.${cellIndex}`}
                    scope="col"
                    dir="auto"
                    className={cn(
                      "px-2.5 py-2",
                      alignClass(block.align[cellIndex] ?? null),
                    )}
                  >
                    {inlineNodes(cell, `${key}.th.${cellIndex}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, rowIndex) => (
                <TableRow key={`${key}.tr.${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={`${key}.td.${rowIndex}.${cellIndex}`}
                      dir="auto"
                      className={cn(
                        "px-2.5 py-1.5",
                        alignClass(block.align[cellIndex] ?? null),
                      )}
                    >
                      {inlineNodes(cell, `${key}.td.${rowIndex}.${cellIndex}`)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          dir="auto"
          className="border-s-2 ps-3 text-muted-foreground"
        >
          {inlineNodes(block.children, key)}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="border-border" />;
    default:
      return null;
  }
}

/**
 * Memoized markdown body for one message. The parent message bubble is
 * itself memoized, so only the message currently streaming re-parses on
 * each `text_delta`; completed messages keep their parsed output cached.
 */
export const AiMarkdown = memo(function AiMarkdown({
  content,
}: {
  content: string;
}) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div
      data-ai-markdown="true"
      dir="auto"
      className="space-y-2.5 text-sm leading-6"
    >
      {blocks.map((block, index) => blockNode(block, `b.${index}`))}
    </div>
  );
});
