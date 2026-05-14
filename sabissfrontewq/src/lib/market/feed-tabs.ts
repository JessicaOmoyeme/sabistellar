import type { CategorySummaryResponse, TagSummaryResponse } from "./types.ts";

export type MarketFeedKind = "featured" | "breaking" | "new" | "category" | "tag" | "search";

export interface MarketFeedTarget {
  kind: MarketFeedKind;
  label: string;
  categorySlug?: string;
  tagSlug?: string;
  query?: string;
}

export interface MarketTopicTabDefinition {
  label: string;
  categoryAliases: readonly string[];
  tagAliases: readonly string[];
  searchQuery?: string;
}

export const MARKET_FEATURED_TAB_TARGETS: readonly MarketFeedTarget[] = [
  { kind: "featured", label: "Trending" },
  { kind: "breaking", label: "Breaking" },
  { kind: "new", label: "New" },
];

export const MARKET_TOPIC_TAB_DEFINITIONS: readonly MarketTopicTabDefinition[] = [
  {
    label: "Politics",
    categoryAliases: ["politics"],
    tagAliases: ["politics"],
  },
  {
    label: "Sports",
    categoryAliases: ["sports"],
    tagAliases: ["sports"],
  },
  {
    label: "Crypto",
    categoryAliases: ["crypto", "cryptocurrency"],
    tagAliases: ["crypto", "cryptocurrency"],
  },
  {
    label: "Esports",
    categoryAliases: ["esports"],
    tagAliases: ["esports"],
  },
  {
    label: "Iran",
    categoryAliases: ["iran"],
    tagAliases: ["iran"],
  },
  {
    label: "Finance",
    categoryAliases: ["finance"],
    tagAliases: ["finance"],
  },
  {
    label: "Geopolitics",
    categoryAliases: ["geopolitical", "geopolitics"],
    tagAliases: ["geopolitical", "geopolitics"],
  },
  {
    label: "Tech",
    categoryAliases: ["tech"],
    tagAliases: ["tech"],
  },
  {
    label: "Culture",
    categoryAliases: ["culture", "entertainment"],
    tagAliases: ["culture", "entertainment", "pop-culture"],
  },
  {
    label: "Economy",
    categoryAliases: ["economy"],
    tagAliases: ["economy"],
  },
  {
    label: "Weather",
    categoryAliases: ["weather"],
    tagAliases: ["weather"],
  },
  {
    label: "Mentions",
    categoryAliases: ["mentions"],
    tagAliases: ["mentions"],
  },
  {
    label: "Elections",
    categoryAliases: ["elections", "global-elections"],
    tagAliases: ["election", "elections"],
  },
];

function normalizeLookupValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findCategoryByAliases(
  categories: readonly CategorySummaryResponse[],
  aliases: readonly string[],
): CategorySummaryResponse | undefined {
  if (aliases.length === 0) {
    return undefined;
  }

  const normalizedAliases = new Set(aliases.map(normalizeLookupValue));

  return categories.find(category => {
    const normalizedSlug = normalizeLookupValue(category.slug);
    const normalizedLabel = normalizeLookupValue(category.label);

    return normalizedAliases.has(normalizedSlug) || normalizedAliases.has(normalizedLabel);
  });
}

function findTagByAliases(
  tags: readonly TagSummaryResponse[],
  aliases: readonly string[],
): TagSummaryResponse | undefined {
  if (aliases.length === 0) {
    return undefined;
  }

  const normalizedAliases = new Set(aliases.map(normalizeLookupValue));

  return tags.find(tag => {
    const normalizedSlug = normalizeLookupValue(tag.slug);
    const normalizedLabel = normalizeLookupValue(tag.label);

    return normalizedAliases.has(normalizedSlug) || normalizedAliases.has(normalizedLabel);
  });
}

export function resolveMarketTopicTabTarget(
  definition: MarketTopicTabDefinition,
  categories: readonly CategorySummaryResponse[],
  tags: readonly TagSummaryResponse[],
): MarketFeedTarget {
  const category = findCategoryByAliases(categories, definition.categoryAliases);

  if (category) {
    return {
      kind: "category",
      label: definition.label,
      categorySlug: category.slug,
    };
  }

  const tag = findTagByAliases(tags, definition.tagAliases);

  if (tag) {
    return {
      kind: "tag",
      label: definition.label,
      tagSlug: tag.slug,
    };
  }

  return {
    kind: "search",
    label: definition.label,
    query: definition.searchQuery ?? definition.label,
  };
}

export function buildMarketFeedHref(target: MarketFeedTarget): string {
  if (target.kind === "search") {
    const params = new URLSearchParams();

    if (target.query) {
      params.set("q", target.query);
    }

    const query = params.toString();
    return query.length > 0 ? `/search?${query}` : "/search";
  }

  const params = new URLSearchParams({
    feed: target.kind,
  });

  if (target.kind === "category" && target.categorySlug) {
    params.set("category", target.categorySlug);
  }

  if (target.kind === "tag" && target.tagSlug) {
    params.set("tag", target.tagSlug);
  }

  if (target.label.trim().length > 0) {
    params.set("label", target.label);
  }

  return `/markets?${params.toString()}`;
}

export function isMarketFeedTargetActive(
  target: MarketFeedTarget,
  pathname: string,
  search: string,
): boolean {
  const params = new URLSearchParams(search);

  if (target.kind === "search") {
    return (
      pathname === "/search" &&
      (params.get("q")?.trim().toLowerCase() ?? "") === (target.query?.trim().toLowerCase() ?? "")
    );
  }

  if (pathname !== "/markets") {
    return false;
  }

  const currentFeed = params.get("feed")?.trim().toLowerCase() ?? "";

  if (currentFeed !== target.kind) {
    return false;
  }

  if (target.kind === "category") {
    return params.get("category") === target.categorySlug;
  }

  if (target.kind === "tag") {
    return params.get("tag") === target.tagSlug;
  }

  return true;
}
