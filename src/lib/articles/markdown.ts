// Minimal front matter and Markdown parsing for original MatchPulse articles
// (content/news/*.md). Deliberately small and dependency-free: the output is a
// block tree rendered by React, never raw HTML, so article files cannot inject
// markup or scripts.
//
// Supported Markdown: paragraphs, "## " and "### " headings, "- " bullet
// lists, "1. " numbered lists, "> " quotes, **bold**, *italic*, and
// [links](https://… or /internal-path).

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] };

// ---- Front matter -------------------------------------------------------------

/**
 * "key: value" lines between "---" fences. Values may be quoted; "true" and
 * "false" become booleans. Returns null when the file has no front matter.
 */
export function parseFrontMatter(source: string): { data: Record<string, string | boolean>; body: string } | null {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) return null;
  const data: Record<string, string | boolean> = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const field = /^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/.exec(line);
    if (!field) continue;
    let value = field[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value === "true" || value === "false") {
      data[field[1]] = value === "true";
      continue;
    }
    data[field[1]] = value;
  }
  return { data, body: match[2] };
}

// ---- Inline -------------------------------------------------------------------

/** Internal paths and https links only; anything else is shown as plain text. */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^\/(?!\/)[^\s]*$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const pushText = (value: string) => {
    if (!value) return;
    const last = out.at(-1);
    if (last?.type === "text") last.text += value;
    else out.push({ type: "text", text: value });
  };
  while (rest) {
    const match = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (!match) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, match.index));
    if (match[1] !== undefined) out.push({ type: "strong", children: parseInline(match[1]) });
    else if (match[2] !== undefined) out.push({ type: "em", children: parseInline(match[2]) });
    else {
      const href = safeHref(match[4]);
      if (href) out.push({ type: "link", href, children: parseInline(match[3]) });
      else pushText(match[3]);
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

// ---- Blocks -------------------------------------------------------------------

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1].length as 2 | 3, children: parseInline(heading[2]) });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const items: Inline[][] = [];
      for (; i < lines.length; i += 1) {
        const item = (ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/).exec(lines[i].trim());
        if (!item) break;
        items.push(parseInline(item[1]));
      }
      i -= 1;
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i += 1) quote.push(lines[i].trim().replace(/^>\s?/, ""));
      i -= 1;
      blocks.push({ type: "quote", children: parseInline(quote.join(" ")) });
      continue;
    }
    if (line.startsWith("# ")) {
      // The title comes from front matter; a level-1 heading becomes a level-2 one.
      flush();
      blocks.push({ type: "heading", level: 2, children: parseInline(line.slice(2)) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Plain text of the body (for word counts). */
export function blocksText(blocks: Block[]): string {
  const inline = (nodes: Inline[]): string => nodes.map((n) => (n.type === "text" ? n.text : inline(n.children))).join("");
  return blocks
    .map((block) => (block.type === "list" ? block.items.map(inline).join(" ") : inline(block.children)))
    .join(" ");
}
