/**
 * Structured data (schema.org JSON-LD). Only describe what is genuinely on the
 * page: never add Article markup for sample news or invent event details.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // Escape "<" so content can never close the script element.
  const json = JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function breadcrumbs(items: { name: string; path: string }[], origin: URL) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, origin).toString(),
    })),
  };
}
