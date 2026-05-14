import MarketDetailFacts from "./MarketDetailFacts.tsx";
import MarketDetailHeader from "./MarketDetailHeader.tsx";
import MarketLiquidityCard from "./MarketLiquidityCard.tsx";
import MarketDetailList from "./MarketDetailList.tsx";
import MarketDetailTabs from "./MarketDetailTabs.tsx";
import MarketResourceLinks from "./MarketResourceLinks.tsx";
import RelatedMarkets from "./RelatedMarkets.tsx";
import ActivityFeed from "./ActivityFeed.tsx";
import type { EventDetailViewModel } from "./types.ts";

interface MarketDetailPageProps {
  adminActionError?: string | null;
  adminEventActionPending?: boolean;
  canAddMarketToEvent?: boolean;
  data: EventDetailViewModel;
  onAddMarketToEvent?: () => void;
  onBootstrapEventLiquidity?: () => void;
  onEditMarket?: (market: EventDetailViewModel["marketList"][number]) => void;
  onEditSelectedMarket?: () => void;
  selectedOutcomeIndex: number;
  onSelectMarket: (marketSlug: string) => void;
  onSelectOutcome: (marketSlug: string, outcomeIndex: number) => void;
}

export default function MarketDetailPage(props: MarketDetailPageProps) {
  return (
    <div class="pm-event-page__shell">
      <MarketDetailHeader
        adminActionError={props.adminActionError}
        adminEventActionPending={props.adminEventActionPending}
        canAddMarketToEvent={props.canAddMarketToEvent}
        data={props.data}
        onAddMarketToEvent={props.onAddMarketToEvent}
        onBootstrapEventLiquidity={props.onBootstrapEventLiquidity}
        onEditSelectedMarket={props.onEditSelectedMarket}
        onSelectMarket={props.onSelectMarket}
      />
      <div class="pm-event-page__layout">
        <div class="pm-event-page__main">
          <MarketDetailList
            canEditMarkets={props.canAddMarketToEvent}
            markets={props.data.marketList}
            onEditMarket={props.onEditMarket}
            selectedOutcomeIndex={props.selectedOutcomeIndex}
            onSelectMarket={props.onSelectMarket}
            onSelectOutcome={props.onSelectOutcome}
          />
          <MarketDetailFacts facts={props.data.facts} />
          <MarketLiquidityCard liquidity={props.data.liquidity} />
          <MarketResourceLinks
            eventId={props.data.eventId}
            marketId={props.data.selectedMarketId}
            conditionId={props.data.selectedConditionId}
            categorySlug={props.data.categorySlug}
            tagSlugs={props.data.tagSlugs}
          />
          <MarketDetailTabs
            rules={props.data.rules}
            context={props.data.context}
            resolutionSources={props.data.resolutionSources}
            resolution={props.data.resolution}
            market={props.data.selectedMarket}
          />
          <RelatedMarkets markets={props.data.relatedMarkets} />
          <ActivityFeed items={props.data.activity} />
        </div>
      </div>
    </div>
  );
}
