import { apiRequest } from "~/lib/api/core";
import { resolveAdminToken } from "~/lib/auth/admin-session";

import type {
  AdminEventListResponse,
  AdminEventMarketsQuery,
  AdminListEventsQuery,
  BootstrapEventLiquidityRequest,
  BootstrapMarketLiquidityRequest,
  CreateEventMarketLadderRequest,
  CreateEventMarketsRequest,
  CreateEventMarketsResponse,
  CreateEventRequest,
  CreateEventResponse,
  CreateMarketRequest,
  CreateMarketResponse,
  DisputeMarketResolutionRequest,
  EmergencyMarketResolutionRequest,
  EventDetailResponse,
  EventLiquidityBootstrapResponse,
  EventMarketsResponse,
  MarketLiquidityBootstrapResponse,
  MarketPricesResponse,
  MarketResolutionWorkflowResponse,
  MarketTradingStatusResponse,
  NegRiskRegistrationResponse,
  ProposeMarketResolutionRequest,
  RegisterNegRiskEventRequest,
  SetMarketPricesRequest,
  UpdateMarketRequest,
  UpdateMarketResponse,
} from "./types";

interface ProtectedRequestOptions {
  token?: string | null;
  signal?: AbortSignal;
}

export function listAdminEvents(
  query?: AdminListEventsQuery,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<AdminEventListResponse>({
    method: "GET",
    path: "/admin/events",
    query,
    token: resolveAdminToken(token),
    signal,
  });
}

export function createAdminEvent(
  payload: CreateEventRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<CreateEventResponse, CreateEventRequest>({
    method: "POST",
    path: "/admin/events",
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function getAdminEvent(
  eventId: string,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<EventDetailResponse>({
    method: "GET",
    path: `/admin/events/${eventId}`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function publishAdminEventShell(
  eventId: string,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<EventDetailResponse>({
    method: "POST",
    path: `/admin/events/${eventId}/publish`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function createAdminEventMarkets(
  eventId: string,
  payload: CreateEventMarketsRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<CreateEventMarketsResponse, CreateEventMarketsRequest>({
    method: "POST",
    path: `/admin/events/${eventId}/markets`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function publishAdminEventMarkets(
  eventId: string,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<EventMarketsResponse>({
    method: "POST",
    path: `/admin/events/${eventId}/markets/publish`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function getAdminEventMarkets(
  eventId: string,
  query?: AdminEventMarketsQuery,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<EventMarketsResponse>({
    method: "GET",
    path: `/admin/events/${eventId}/markets`,
    query,
    token: resolveAdminToken(token),
    signal,
  });
}

export function createAdminEventMarketLadder(
  eventId: string,
  payload: CreateEventMarketLadderRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<CreateEventMarketsResponse, CreateEventMarketLadderRequest>({
    method: "POST",
    path: `/admin/events/${eventId}/markets/ladders`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function registerAdminNegRiskEvent(
  eventId: string,
  payload: RegisterNegRiskEventRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<NegRiskRegistrationResponse, RegisterNegRiskEventRequest>({
    method: "POST",
    path: `/admin/events/${eventId}/neg-risk/register`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function createAdminMarket(
  payload: CreateMarketRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<CreateMarketResponse, CreateMarketRequest>({
    method: "POST",
    path: "/admin/markets",
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function updateAdminMarket(
  marketId: string,
  payload: UpdateMarketRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<UpdateMarketResponse, UpdateMarketRequest>({
    method: "PATCH",
    path: `/admin/markets/${marketId}`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function setAdminMarketPrices(
  marketId: string,
  payload: SetMarketPricesRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketPricesResponse, SetMarketPricesRequest>({
    method: "POST",
    path: `/admin/markets/${marketId}/prices`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function bootstrapAdminMarketLiquidity(
  marketId: string,
  payload: BootstrapMarketLiquidityRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketLiquidityBootstrapResponse, BootstrapMarketLiquidityRequest>({
    method: "POST",
    path: `/admin/markets/${marketId}/liquidity/bootstrap`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function bootstrapAdminEventLiquidity(
  eventId: string,
  payload: BootstrapEventLiquidityRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<EventLiquidityBootstrapResponse, BootstrapEventLiquidityRequest>({
    method: "POST",
    path: `/admin/events/${eventId}/liquidity/bootstrap`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function pauseAdminMarket(marketId: string, { token, signal }: ProtectedRequestOptions = {}) {
  return apiRequest<MarketTradingStatusResponse>({
    method: "POST",
    path: `/admin/markets/${marketId}/pause`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function unpauseAdminMarket(
  marketId: string,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketTradingStatusResponse>({
    method: "POST",
    path: `/admin/markets/${marketId}/unpause`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function proposeAdminMarketResolution(
  marketId: string,
  payload: ProposeMarketResolutionRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketResolutionWorkflowResponse, ProposeMarketResolutionRequest>({
    method: "POST",
    path: `/admin/markets/${marketId}/resolution/propose`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function disputeAdminMarketResolution(
  marketId: string,
  payload: DisputeMarketResolutionRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketResolutionWorkflowResponse, DisputeMarketResolutionRequest>({
    method: "POST",
    path: `/admin/markets/${marketId}/resolution/dispute`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}

export function finalizeAdminMarketResolution(
  marketId: string,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketResolutionWorkflowResponse>({
    method: "POST",
    path: `/admin/markets/${marketId}/resolution/finalize`,
    token: resolveAdminToken(token),
    signal,
  });
}

export function emergencyResolveAdminMarket(
  marketId: string,
  payload: EmergencyMarketResolutionRequest,
  { token, signal }: ProtectedRequestOptions = {},
) {
  return apiRequest<MarketResolutionWorkflowResponse, EmergencyMarketResolutionRequest>({
    method: "POST",
    path: `/admin/markets/${marketId}/resolution/emergency`,
    body: payload,
    token: resolveAdminToken(token),
    signal,
  });
}
