import { useParams } from "@solidjs/router";

import { MarketResourceScreen } from "~/components/public-browser/index.ts";

export default function MarketResourceRoute() {
  const params = useParams<{ marketId: string }>();

  return <MarketResourceScreen marketId={params.marketId} />;
}
