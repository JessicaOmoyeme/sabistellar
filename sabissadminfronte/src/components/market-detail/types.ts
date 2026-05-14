import type {
  MarketActivityItemResponse,
  MarketLiquidityResponse,
  MarketResolutionStateResponse,
  PublicMarketCardResponse,
} from "~/lib/market/types.ts";

export interface OutcomeQuote {
  outcomeIndex: number;
  label: string;
  price: number | null;
  centsLabel: string;
  probabilityLabel: string;
  href: string;
}

export interface EventMarketTabItem {
  label: string;
  href: string;
  marketSlug: string;
  isSelected: boolean;
}

export interface EventMarketListItem {
  id: string;
  slug: string;
  label: string;
  meta: string;
  headerMeta: string;
  href: string;
  primaryMetric: string;
  buyYesBps: number | null;
  buyNoBps: number | null;
  isSelected: boolean;
  quotes: OutcomeQuote[];
  actionQuotes: OutcomeQuote[];
  pill: EventMarketTabItem;
}

export interface EventFactItem {
  label: string;
  value: string;
  mono?: boolean;
}

export interface EventDetailViewModel {
  eventId: string | null;
  eventPublicationStatus: string | null;
  eventSlug: string;
  eventTitle: string;
  eventImageUrl: string | null;
  categorySlug: string;
  categoryLabel: string;
  subcategoryLabel: string | null;
  tagSlugs: string[];
  marketCount: number;
  selectedMarketId: string;
  selectedConditionId: string | null;
  selectedMarket: EventMarketListItem;
  selectedMarketQuestion: string;
  selectedMarketType: string;
  selectedMarketStatus: string;
  rules: string;
  context: string | null;
  resolutionSources: string[];
  facts: EventFactItem[];
  marketTabs: EventMarketTabItem[];
  marketList: EventMarketListItem[];
  relatedMarkets: PublicMarketCardResponse[];
  activity: MarketActivityItemResponse[];
  liquidity: MarketLiquidityResponse | null;
  resolution: MarketResolutionStateResponse | null;
}
