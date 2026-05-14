import { Navigate, useParams } from "@solidjs/router";

import { buildEventHref } from "~/components/market-detail/format.ts";

export default function EventMarketDetailRoute() {
  const params = useParams<{ eventSlug: string; marketSlug: string }>();

  return <Navigate href={buildEventHref(params.eventSlug)} />;
}
