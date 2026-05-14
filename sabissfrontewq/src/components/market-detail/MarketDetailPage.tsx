import MarketDetailFacts from "./MarketDetailFacts.tsx";
import MarketDetailHeader from "./MarketDetailHeader.tsx";
import MarketLiquidityCard from "./MarketLiquidityCard.tsx";
import MarketDetailList from "./MarketDetailList.tsx";
import MarketPricePanel from "./MarketPricePanel.tsx";
import MarketDetailTabs from "./MarketDetailTabs.tsx";
import MarketTradePanel from "./MarketTradePanel.tsx";
import MarketResourceLinks from "./MarketResourceLinks.tsx";
import RelatedMarkets from "./RelatedMarkets.tsx";
import ActivityFeed from "./ActivityFeed.tsx";
import CommentsSection from "./CommentsSection.tsx";
import { Show } from "solid-js";
import type { EventDetailViewModel } from "./types.ts";

interface MarketDetailPageProps {
  data: EventDetailViewModel;
  selectedOutcomeIndex: number;
  onSelectMarket: (marketSlug: string) => void;
  onSelectOutcome: (marketSlug: string, outcomeIndex: number) => void;
  onCommentsChange: (marketId: string, comments: EventDetailViewModel["comments"]) => void;
}

export default function MarketDetailPage(props: MarketDetailPageProps) {
  return (
    <div class="pm-event-page__shell">
      <MarketDetailHeader data={props.data} onSelectMarket={props.onSelectMarket} />
      <div class="pm-event-page__layout">
        <div class="pm-event-page__main">
          <section class="pm-event-page__board">
            <MarketPricePanel
              market={props.data.selectedMarket}
              question={props.data.selectedMarketQuestion}
              status={props.data.selectedMarketStatus}
              volumeLabel={props.data.selectedMarketVolumeLabel}
              endsAt={props.data.selectedMarketEndsAt}
              orderbook={props.data.selectedMarketOrderbook}
              priceHistory={props.data.selectedMarketPriceHistory}
              selectedOutcomeIndex={props.selectedOutcomeIndex}
              onSelectOutcome={outcomeIndex =>
                props.onSelectOutcome(props.data.selectedMarket.slug, outcomeIndex)
              }
            />
            <Show when={props.data.marketList.some(market => !market.isSelected)}>
              <MarketDetailList
                markets={props.data.marketList.filter(market => !market.isSelected)}
                selectedOutcomeIndex={props.selectedOutcomeIndex}
                onSelectMarket={props.onSelectMarket}
                onSelectOutcome={props.onSelectOutcome}
              />
            </Show>
          </section>
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
          <CommentsSection
            marketId={props.data.selectedMarketId}
            items={props.data.comments}
            onCommentsChange={props.onCommentsChange}
          />
        </div>

        <div class="pm-event-page__aside">
          <MarketTradePanel
            market={props.data.selectedMarket}
            question={props.data.selectedMarketQuestion}
            selectedOutcomeIndex={props.selectedOutcomeIndex}
            onSelectOutcome={outcomeIndex =>
              props.onSelectOutcome(props.data.selectedMarket.slug, outcomeIndex)
            }
          />
        </div>
      </div>
    </div>
  );
}
