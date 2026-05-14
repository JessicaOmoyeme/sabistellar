import { useParams } from "@solidjs/router";

import { MarketDetailScreen } from "~/components/market-detail/index.ts";

export default function EventDetailRoute() {
  const params = useParams<{ eventSlug: string }>();

  return <MarketDetailScreen eventSlug={params.eventSlug} />;
}
