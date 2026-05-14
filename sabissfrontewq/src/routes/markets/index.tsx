import { useSearchParams } from "@solidjs/router";

import { MarketBrowseScreen } from "~/components/public-browser/index.ts";

export default function MarketBrowseRoute() {
  const [searchParams] = useSearchParams<{
    feed?: string;
    category?: string;
    tag?: string;
    label?: string;
  }>();

  return (
    <MarketBrowseScreen
      feed={searchParams.feed}
      category={searchParams.category}
      tag={searchParams.tag}
      label={searchParams.label}
    />
  );
}
