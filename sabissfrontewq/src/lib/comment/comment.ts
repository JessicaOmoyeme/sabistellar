import { normalizeApiBaseUrl, requestJson } from "../api.ts";
import type {
  CommentClientOptions,
  CreateMarketCommentRequest,
  MarketCommentLikeResponse,
  MarketCommentsResponse,
  MarketCommentWriteResponse,
} from "./types.ts";

function readViteEnv(key: "VITE_API_BASE_URL"): string | undefined {
  return import.meta.env?.[key];
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export interface CommentClient {
  fetchMarketComments(marketId: string): Promise<MarketCommentsResponse>;
  createMarketComment(
    token: string,
    marketId: string,
    payload: CreateMarketCommentRequest,
  ): Promise<MarketCommentWriteResponse>;
  createMarketCommentReply(
    token: string,
    marketId: string,
    commentId: string,
    payload: CreateMarketCommentRequest,
  ): Promise<MarketCommentWriteResponse>;
  likeComment(token: string, commentId: string): Promise<MarketCommentLikeResponse>;
  unlikeComment(token: string, commentId: string): Promise<MarketCommentLikeResponse>;
}

export function createCommentClient(options: CommentClientOptions = {}): CommentClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchMarketComments(marketId) {
      return requestJson<MarketCommentsResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/comments`,
      );
    },

    createMarketComment(token, marketId, payload) {
      return requestJson<MarketCommentWriteResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          json: payload,
        },
      );
    },

    createMarketCommentReply(token, marketId, commentId, payload) {
      return requestJson<MarketCommentWriteResponse>(
        baseUrl,
        `/markets/${encodePathSegment(marketId)}/comments/${encodePathSegment(commentId)}/replies`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          json: payload,
        },
      );
    },

    likeComment(token, commentId) {
      return requestJson<MarketCommentLikeResponse>(
        baseUrl,
        `/comments/${encodePathSegment(commentId)}/likes`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    },

    unlikeComment(token, commentId) {
      return requestJson<MarketCommentLikeResponse>(
        baseUrl,
        `/comments/${encodePathSegment(commentId)}/likes`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    },
  };
}

export const commentClient = createCommentClient({
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});

export { ApiError } from "../api.ts";
