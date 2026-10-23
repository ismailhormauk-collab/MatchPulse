import Link from "next/link";
import type { Block, Inline } from "@/lib/articles/markdown";

/** Renders an article's parsed Markdown (no raw HTML). */
export function ArticleBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink/90 sm:text-base">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} className="pt-3 font-display text-xl font-bold leading-tight text-ink sm:text-2xl">
                <Inlines nodes={block.children} />
              </h2>
            ) : (
              <h3 key={index} className="pt-2 text-lg font-semibold text-ink">
                <Inlines nodes={block.children} />
              </h3>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index} className={`space-y-1.5 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-pulse`}>
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inlines nodes={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return (
              <blockquote key={index} className="border-l-2 border-pulse pl-4 italic text-ink/80">
                <Inlines nodes={block.children} />
              </blockquote>
            );
          default:
            return (
              <p key={index}>
                <Inlines nodes={block.children} />
              </p>
            );
        }
      })}
    </div>
  );
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    if (node.type === "strong") {
      return (
        <strong key={index} className="font-semibold text-ink">
          <Inlines nodes={node.children} />
        </strong>
      );
    }
    if (node.type === "em") {
      return (
        <em key={index}>
          <Inlines nodes={node.children} />
        </em>
      );
    }
    const className = "font-medium text-pulse underline underline-offset-2 hover:text-ink";
    return node.href.startsWith("/") ? (
      <Link key={index} href={node.href} className={className}>
        <Inlines nodes={node.children} />
      </Link>
    ) : (
      <a key={index} href={node.href} target="_blank" rel="noopener" className={className}>
        <Inlines nodes={node.children} />
      </a>
    );
  });
}
