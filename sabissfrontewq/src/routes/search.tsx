import { useSearchParams } from "@solidjs/router";

import { MarketSearchScreen } from "~/components/public-browser/index.ts";

export default function SearchRoute() {
  const [searchParams] = useSearchParams<{ q?: string }>();

  return <MarketSearchScreen query={searchParams.q} />;
}
