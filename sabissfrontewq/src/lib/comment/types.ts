import type {
  EventOnChainResponse,
  EventResponse,
  IsoDateTimeString,
  MarketResponse,
  Uuid,
} from "../market/types.ts";

export interface CommentClientOptions {
  baseUrl?: string;
}

export interface CreateMarketCommentFieldsRequest {
  body: string;
}

export interface CreateMarketCommentRequest {
  comment: CreateMarketCommentFieldsRequest;
}

export interface MarketCommentAuthorResponse {
  user_id: Uuid;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface MarketCommentResponse {
  id: Uuid;
  parent_comment_id?: Uuid | null;
  body: string;
  author: MarketCommentAuthorResponse;
  like_count: number;
  reply_count: number;
  replies: MarketCommentResponse[];
  created_at: IsoDateTimeString;
  updated_at: IsoDateTimeString;
}

export interface MarketCommentsResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  comments: MarketCommentResponse[];
}

export interface MarketCommentWriteResponse {
  event: EventResponse;
  on_chain: EventOnChainResponse;
  market: MarketResponse;
  comment: MarketCommentResponse;
}

export interface MarketCommentLikeResponse {
  comment_id: Uuid;
  market_id: Uuid;
  like_count: number;
  liked: boolean;
  updated_at: IsoDateTimeString;
}
