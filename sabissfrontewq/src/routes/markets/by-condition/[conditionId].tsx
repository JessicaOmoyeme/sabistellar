import { useParams } from "@solidjs/router";

import { MarketResourceScreen } from "~/components/public-browser/index.ts";

export default function MarketByConditionRoute() {
  const params = useParams<{ conditionId: string }>();

  return <MarketResourceScreen conditionId={params.conditionId} />;
}
