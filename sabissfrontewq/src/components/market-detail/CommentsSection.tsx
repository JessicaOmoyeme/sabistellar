import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import {
  AUTH_SESSION_CHANGE_EVENT,
  readStoredAuthSession,
  type StoredAuthSession,
} from "~/lib/auth/session.ts";
import { ApiError, commentClient } from "~/lib/comment/index.ts";
import type { MarketCommentAuthorResponse, MarketCommentResponse } from "~/lib/comment/types.ts";

import { formatRelativeTime } from "./format.ts";

const MAX_COMMENT_BODY_LEN = 2_000;
const INITIAL_VISIBLE_COMMENTS = 12;
const VISIBLE_COMMENT_STEP = 20;

interface CommentsSectionProps {
  marketId: string;
  items: MarketCommentResponse[];
  onCommentsChange?: (marketId: string, comments: MarketCommentResponse[]) => void;
}

function hashValue(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function sortCommentsByNewest(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return [...comments].sort((left, right) => {
    const leftTimestamp = Date.parse(left.created_at);
    const rightTimestamp = Date.parse(right.created_at);

    if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp)) {
      return right.id.localeCompare(left.id);
    }

    return rightTimestamp - leftTimestamp;
  });
}

function sortCommentsByOldest(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return [...comments].sort((left, right) => {
    const leftTimestamp = Date.parse(left.created_at);
    const rightTimestamp = Date.parse(right.created_at);

    if (Number.isNaN(leftTimestamp) || Number.isNaN(rightTimestamp)) {
      return left.id.localeCompare(right.id);
    }

    return leftTimestamp - rightTimestamp;
  });
}

function dedupeComments(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return Array.from(new Map(comments.map(comment => [comment.id, comment])).values());
}

function normalizeComment(comment: MarketCommentResponse): MarketCommentResponse {
  return {
    ...comment,
    replies: normalizeReplyComments(comment.replies ?? []),
  };
}

function normalizeRootComments(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return sortCommentsByNewest(dedupeComments(comments).map(normalizeComment));
}

function normalizeReplyComments(
  comments: readonly MarketCommentResponse[],
): MarketCommentResponse[] {
  return sortCommentsByOldest(dedupeComments(comments).map(normalizeComment));
}

function createCommentsSignature(comments: readonly MarketCommentResponse[]): string {
  return comments
    .map(comment => {
      return [
        comment.id,
        comment.updated_at,
        comment.like_count,
        comment.reply_count,
        comment.body,
        createCommentsSignature(comment.replies ?? []),
      ].join(":");
    })
    .join("|");
}

function updateCommentTree(
  comments: readonly MarketCommentResponse[],
  commentId: string,
  updater: (comment: MarketCommentResponse) => MarketCommentResponse,
): MarketCommentResponse[] {
  let didChange = false;

  const nextComments = comments.map(comment => {
    if (comment.id === commentId) {
      didChange = true;
      return normalizeComment(updater(comment));
    }

    const nextReplies = updateCommentTree(comment.replies ?? [], commentId, updater);

    if (nextReplies !== (comment.replies ?? [])) {
      didChange = true;
      return {
        ...comment,
        replies: nextReplies,
      };
    }

    return comment;
  });

  return didChange ? nextComments : (comments as MarketCommentResponse[]);
}

function insertReplyIntoTree(
  comments: readonly MarketCommentResponse[],
  parentCommentId: string,
  reply: MarketCommentResponse,
): MarketCommentResponse[] {
  const normalizedReply = normalizeComment(reply);

  return updateCommentTree(comments, parentCommentId, comment => {
    const alreadyExists = (comment.replies ?? []).some(existing => existing.id === normalizedReply.id);
    const nextReplies = normalizeReplyComments(
      alreadyExists
        ? comment.replies.map(existing =>
            existing.id === normalizedReply.id ? normalizedReply : existing,
          )
        : [...(comment.replies ?? []), normalizedReply],
    );

    return {
      ...comment,
      replies: nextReplies,
      reply_count: alreadyExists
        ? Math.max(comment.reply_count, nextReplies.length)
        : Math.max(comment.reply_count + 1, nextReplies.length),
    };
  });
}

function getAuthorLabel(author: MarketCommentAuthorResponse): string {
  const displayName = author.display_name?.trim();

  if (displayName) {
    return displayName;
  }

  const username = author.username?.trim();

  if (username) {
    return username;
  }

  return "Trader";
}

function getAuthorSecondaryLabel(author: MarketCommentAuthorResponse): string | null {
  const displayName = author.display_name?.trim();
  const username = author.username?.trim();

  if (displayName && username && displayName.toLowerCase() !== username.toLowerCase()) {
    return `@${username}`;
  }

  return null;
}

function getAuthorInitials(author: MarketCommentAuthorResponse): string {
  const label = getAuthorLabel(author);
  const tokens = label
    .split(/[\s._-]+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
  }

  return label.slice(0, 1).toUpperCase() || "T";
}

function getAuthorAvatarStyle(author: MarketCommentAuthorResponse): string {
  const hue = hashValue(author.user_id) % 360;
  return `background: hsla(${hue}, 75%, 94%, 1); color: hsl(${hue}, 58%, 32%);`;
}

function getCommentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to publish this comment.";
}

function resizeTextarea(element: HTMLTextAreaElement | undefined) {
  if (!element) {
    return;
  }

  element.style.height = "48px";
  element.style.height = `${Math.min(Math.max(element.scrollHeight, 48), 208)}px`;
}

function CommentAvatar(props: { author: MarketCommentAuthorResponse; compact?: boolean }) {
  const [imageFailed, setImageFailed] = createSignal(false);

  return (
    <Show
      when={props.author.avatar_url && !imageFailed()}
      fallback={
        <div
          classList={{
            "pm-comments__avatar": true,
            "pm-comments__avatar--fallback": true,
            "pm-comments__avatar--reply": props.compact === true,
          }}
          style={getAuthorAvatarStyle(props.author)}
          aria-hidden="true"
        >
          <span class="pm-comments__avatar-initials">{getAuthorInitials(props.author)}</span>
        </div>
      }
    >
      <img
        classList={{
          "pm-comments__avatar": true,
          "pm-comments__avatar--reply": props.compact === true,
        }}
        src={props.author.avatar_url!}
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    </Show>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <polyline
        points="1.75 4.25 6 8.5 10.25 4.25"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M6 .75 10.25 2.5v4.969c0 2.201-3.185 3.449-4.041 3.745a.641.641 0 0 1-.419 0C4.935 10.918 1.75 9.67 1.75 7.469V2.5L6 .75Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function EmojiIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle
        cx="9"
        cy="9"
        r="7.25"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <path
        d="M12.749 11c-.717 1.338-2.128 2.25-3.749 2.25S5.967 12.338 5.251 11"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <circle cx="7" cy="8" r="1" fill="currentColor" />
      <circle cx="11" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="m12.401 2.75-.021-.036c-.399-.688-1.186-1.102-2.021-.977L3.456 2.766A2 2 0 0 0 1.75 5.038l.978 6.581"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <rect
        x="5.25"
        y="5.25"
        width="10.5"
        height="10.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
      <circle cx="8.25" cy="10" r="1" fill="currentColor" />
      <circle cx="12.75" cy="10" r="1" fill="currentColor" />
      <path
        d="M9.37 11.824c.716.172 1.459.179 2.234 0 .343-.079.663.176.643.527-.052.919-.815 1.649-1.747 1.649-.922 0-1.678-.714-1.745-1.619-.025-.341.282-.637.615-.557Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OverflowMenuIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r=".75" fill="currentColor" />
      <circle cx="3.25" cy="9" r=".75" fill="currentColor" />
      <circle cx="14.75" cy="9" r=".75" fill="currentColor" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 3.829c-.908-.835-2.096-1.298-3.33-1.298-.653 0-1.299.13-1.902.381a5.01 5.01 0 0 0-1.609 1.083c-1.961 1.969-1.96 5.049.001 7.01l6.11 6.11c.142.249.415.41.73.41.128 0 .255-.032.369-.091a1.02 1.02 0 0 0 .289-.249l6.179-6.179c1.962-1.962 1.962-5.041-.001-7.014a4.995 4.995 0 0 0-1.608-1.081 4.904 4.904 0 0 0-1.9-.38c-1.234 0-2.422.463-3.328 1.298Zm5.659 1.342c1.303 1.309 1.303 3.354.002 4.656L10 15.488 4.339 9.827c-1.302-1.302-1.301-3.347-.002-4.653a3.292 3.292 0 0 1 2.333-.977c.87 0 1.695.347 2.324.975l.417.417a.833.833 0 0 0 1.178 0l.417-.417a3.29 3.29 0 0 1 4.653-.001Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function CommentsSection(props: CommentsSectionProps) {
  const [session, setSession] = createSignal<StoredAuthSession | null>(readStoredAuthSession());
  const [draft, setDraft] = createSignal("");
  const [comments, setComments] = createSignal<MarketCommentResponse[]>(
    normalizeRootComments(props.items),
  );
  const [visibleCount, setVisibleCount] = createSignal(INITIAL_VISIBLE_COMMENTS);
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [replyTargetId, setReplyTargetId] = createSignal<string | null>(null);
  const [replyDrafts, setReplyDrafts] = createSignal<Record<string, string>>({});
  const [replySubmittingId, setReplySubmittingId] = createSignal<string | null>(null);
  const [likedCommentIds, setLikedCommentIds] = createSignal<Record<string, true>>({});
  const [likePendingIds, setLikePendingIds] = createSignal<Record<string, true>>({});
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [copiedCommentId, setCopiedCommentId] = createSignal<string | null>(null);
  let copiedResetTimer: number | undefined;
  let textareaElement: HTMLTextAreaElement | undefined;
  const commentsSignature = createMemo(() => createCommentsSignature(props.items));

  const syncSession = () => {
    setSession(readStoredAuthSession());
  };

  if (typeof window !== "undefined") {
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, syncSession);
    window.addEventListener("focus", syncSession);

    onCleanup(() => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, syncSession);
      window.removeEventListener("focus", syncSession);
    });
  }

  createEffect(() => {
    commentsSignature();
    setComments(normalizeRootComments(props.items));
  });

  createEffect(() => {
    draft();
    queueMicrotask(() => {
      resizeTextarea(textareaElement);
    });
  });

  createEffect(() => {
    props.marketId;
    setDraft("");
    setVisibleCount(INITIAL_VISIBLE_COMMENTS);
    setReplyTargetId(null);
    setReplyDrafts({});
    setReplySubmittingId(null);
    setLikedCommentIds({});
    setLikePendingIds({});
    setStatusMessage(null);
    setErrorMessage(null);
    setCopiedCommentId(null);
  });

  onCleanup(() => {
    if (copiedResetTimer !== undefined && typeof window !== "undefined") {
      window.clearTimeout(copiedResetTimer);
    }
  });

  const visibleComments = createMemo(() => comments().slice(0, visibleCount()));
  const hasHiddenComments = createMemo(() => visibleCount() < comments().length);
  const canSubmit = createMemo(() => {
    return !isSubmitting() && draft().trim().length > 0;
  });
  const submitLabel = createMemo(() => {
    return isSubmitting() ? "Posting..." : "Post";
  });

  const ensureAuthenticated = (message: string): StoredAuthSession | null => {
    const activeSession = readStoredAuthSession();
    setSession(activeSession);

    if (!activeSession?.token) {
      setStatusMessage(null);
      setErrorMessage(message);
      openAuthModal();
      return null;
    }

    return activeSession;
  };

  const openAuthModal = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sabi:open-auth-modal"));
    }
  };

  const publishComments = (nextComments: MarketCommentResponse[]) => {
    const sortedComments = normalizeRootComments(nextComments);
    setComments(sortedComments);
    props.onCommentsChange?.(props.marketId, sortedComments);
  };

  const handleDraftInput = (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
    setDraft(event.currentTarget.value.slice(0, MAX_COMMENT_BODY_LEN));
    setStatusMessage(null);
    setErrorMessage(null);
    resizeTextarea(event.currentTarget);
  };

  const handleSubmit = async () => {
    if (isSubmitting()) {
      return;
    }

    const activeSession = ensureAuthenticated("Sign in to join the discussion.");

    if (!activeSession?.token) {
      return;
    }

    const body = draft().trim();

    if (body.length === 0) {
      setStatusMessage(null);
      setErrorMessage("comment.body is required");
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await commentClient.createMarketComment(activeSession.token, props.marketId, {
        comment: {
          body,
        },
      });

      publishComments([response.comment, ...comments()]);
      setVisibleCount(current => Math.max(current, INITIAL_VISIBLE_COMMENTS));
      setDraft("");
      setStatusMessage("Comment posted.");
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getCommentErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const replyDraftFor = (commentId: string) => replyDrafts()[commentId] ?? "";

  const setReplyDraft = (commentId: string, value: string) => {
    setReplyDrafts(current => ({
      ...current,
      [commentId]: value.slice(0, MAX_COMMENT_BODY_LEN),
    }));
  };

  const clearReplyDraft = (commentId: string) => {
    setReplyDrafts(current => {
      const nextDrafts = { ...current };
      delete nextDrafts[commentId];
      return nextDrafts;
    });
  };

  const isCommentLiked = (commentId: string) => Boolean(likedCommentIds()[commentId]);
  const isLikePending = (commentId: string) => Boolean(likePendingIds()[commentId]);
  const isReplySubmitting = (commentId: string) => replySubmittingId() === commentId;
  const isReplyComposerOpen = (commentId: string) => replyTargetId() === commentId;
  const canSubmitReply = (commentId: string) =>
    !isReplySubmitting(commentId) && replyDraftFor(commentId).trim().length > 0;

  const openReplyComposer = (commentId: string) => {
    setReplyTargetId(commentId);
    setStatusMessage(null);
    setErrorMessage(null);

    const activeSession = readStoredAuthSession();
    setSession(activeSession);

    if (!activeSession?.token) {
      openAuthModal();
    }
  };

  const closeReplyComposer = () => {
    setReplyTargetId(null);
  };

  const handleReplySubmit = async (parentCommentId: string) => {
    if (isReplySubmitting(parentCommentId)) {
      return;
    }

    const activeSession = ensureAuthenticated("Sign in to reply to comments.");

    if (!activeSession?.token) {
      return;
    }

    const body = replyDraftFor(parentCommentId).trim();

    if (body.length === 0) {
      setStatusMessage(null);
      setErrorMessage("comment.body is required");
      return;
    }

    setReplySubmittingId(parentCommentId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await commentClient.createMarketCommentReply(
        activeSession.token,
        props.marketId,
        parentCommentId,
        {
          comment: {
            body,
          },
        },
      );

      publishComments(insertReplyIntoTree(comments(), parentCommentId, response.comment));
      clearReplyDraft(parentCommentId);
      setReplyTargetId(null);
      setStatusMessage("Reply posted.");
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getCommentErrorMessage(error));
    } finally {
      setReplySubmittingId(null);
    }
  };

  const setCommentLikePending = (commentId: string, pending: boolean) => {
    setLikePendingIds(current => {
      const nextPending = { ...current };

      if (pending) {
        nextPending[commentId] = true;
      } else {
        delete nextPending[commentId];
      }

      return nextPending;
    });
  };

  const setCommentLikedState = (commentId: string, liked: boolean) => {
    setLikedCommentIds(current => {
      const nextLiked = { ...current };

      if (liked) {
        nextLiked[commentId] = true;
      } else {
        delete nextLiked[commentId];
      }

      return nextLiked;
    });
  };

  const handleLikeToggle = async (commentId: string) => {
    if (isLikePending(commentId)) {
      return;
    }

    const activeSession = ensureAuthenticated("Sign in to react to comments.");

    if (!activeSession?.token) {
      return;
    }

    setCommentLikePending(commentId, true);
    setErrorMessage(null);

    try {
      const response = isCommentLiked(commentId)
        ? await commentClient.unlikeComment(activeSession.token, commentId)
        : await commentClient.likeComment(activeSession.token, commentId);

      setCommentLikedState(commentId, response.liked);
      publishComments(
        updateCommentTree(comments(), commentId, comment => ({
          ...comment,
          like_count: response.like_count,
        })),
      );
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getCommentErrorMessage(error));
    } finally {
      setCommentLikePending(commentId, false);
    }
  };

  const copyCommentLink = async (commentId: string) => {
    if (
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      typeof navigator.clipboard?.writeText !== "function"
    ) {
      return;
    }

    try {
      const url = new URL(window.location.href);
      url.hash = `comment-${commentId}`;
      await navigator.clipboard.writeText(url.toString());
      setStatusMessage("Comment link copied.");
      setErrorMessage(null);
      setCopiedCommentId(commentId);

      if (copiedResetTimer !== undefined) {
        window.clearTimeout(copiedResetTimer);
      }

      copiedResetTimer = window.setTimeout(() => {
        setCopiedCommentId(null);
      }, 1800);
    } catch {
      setStatusMessage(null);
      setErrorMessage("Unable to copy this comment link.");
    }
  };

  const showMoreComments = () => {
    setVisibleCount(current => Math.min(current + VISIBLE_COMMENT_STEP, comments().length));
  };

  const CommentNode = (nodeProps: { comment: MarketCommentResponse; depth?: number }) => {
    const isReply = () => (nodeProps.depth ?? 0) > 0;
    const replyCount = createMemo(() =>
      Math.max(nodeProps.comment.reply_count, nodeProps.comment.replies.length),
    );

    return (
      <article
        id={`comment-${nodeProps.comment.id}`}
        classList={{
          "pm-comments__item": true,
          "pm-comments__item--reply": isReply(),
        }}
      >
        <CommentAvatar author={nodeProps.comment.author} compact={isReply()} />

        <div class="pm-comments__content">
          <div class="pm-comments__item-header">
            <div class="pm-comments__identity">
              <div class="pm-comments__author-line">
                <p class="pm-comments__author">{getAuthorLabel(nodeProps.comment.author)}</p>
                <Show when={getAuthorSecondaryLabel(nodeProps.comment.author)}>
                  <p class="pm-comments__secondary">
                    {getAuthorSecondaryLabel(nodeProps.comment.author)}
                  </p>
                </Show>
                <p class="pm-comments__timestamp" title={nodeProps.comment.created_at}>
                  {formatRelativeTime(nodeProps.comment.created_at)}
                </p>
              </div>
            </div>

            <button
              type="button"
              classList={{
                "pm-comments__menu-button": true,
                "pm-comments__menu-button--copied": copiedCommentId() === nodeProps.comment.id,
              }}
              title="Copy comment link"
              aria-label="Copy comment link"
              onClick={() => void copyCommentLink(nodeProps.comment.id)}
            >
              <OverflowMenuIcon />
            </button>
          </div>

          <div class="pm-comments__body-wrap">
            <p class="pm-comments__body">{nodeProps.comment.body}</p>
          </div>

          <div class="pm-comments__actions">
            <button
              type="button"
              classList={{
                "pm-comments__reaction": true,
                "pm-comments__reaction--active": isCommentLiked(nodeProps.comment.id),
                "pm-comments__reaction--busy": isLikePending(nodeProps.comment.id),
              }}
              disabled={isLikePending(nodeProps.comment.id)}
              aria-pressed={isCommentLiked(nodeProps.comment.id)}
              title={isCommentLiked(nodeProps.comment.id) ? "Unlike comment" : "Like comment"}
              onClick={() => void handleLikeToggle(nodeProps.comment.id)}
            >
              <HeartIcon />
              <span>{nodeProps.comment.like_count}</span>
            </button>

            <button
              type="button"
              class="pm-comments__action-link"
              onClick={() => openReplyComposer(nodeProps.comment.id)}
            >
              Reply
            </button>
          </div>

          <Show when={replyCount() > 0}>
            <p class="pm-comments__reply-summary">
              {replyCount()} {replyCount() === 1 ? "Reply" : "Replies"}
            </p>
          </Show>

          <Show when={isReplyComposerOpen(nodeProps.comment.id)}>
            <form
              class="pm-comments__reply-form"
              onSubmit={event => {
                event.preventDefault();
                void handleReplySubmit(nodeProps.comment.id);
              }}
            >
              <div class="pm-comments__reply-frame">
                <textarea
                  class="pm-comments__reply-textarea"
                  rows="1"
                  value={replyDraftFor(nodeProps.comment.id)}
                  maxLength={MAX_COMMENT_BODY_LEN}
                  placeholder="Write a reply..."
                  ref={element => {
                    resizeTextarea(element);
                  }}
                  onFocus={() => {
                    if (!session()?.token) {
                      openAuthModal();
                    }
                  }}
                  onInput={event => {
                    setReplyDraft(nodeProps.comment.id, event.currentTarget.value);
                    setStatusMessage(null);
                    setErrorMessage(null);
                    resizeTextarea(event.currentTarget);
                  }}
                />

                <div class="pm-comments__reply-controls">
                  <button
                    type="button"
                    class="pm-comments__action-link"
                    onClick={closeReplyComposer}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    class="pm-button pm-button--primary pm-comments__reply-submit"
                    disabled={!canSubmitReply(nodeProps.comment.id)}
                  >
                    {isReplySubmitting(nodeProps.comment.id) ? "Posting..." : "Post"}
                  </button>
                </div>
              </div>
            </form>
          </Show>

          <Show when={nodeProps.comment.replies.length > 0}>
            <div class="pm-comments__replies">
              <For each={nodeProps.comment.replies}>
                {reply => <CommentNode comment={reply} depth={(nodeProps.depth ?? 0) + 1} />}
              </For>
            </div>
          </Show>
        </div>
      </article>
    );
  };

  return (
    <section class="pm-comments" data-nosnippet="true">
      <div id="commentsInner" class="pm-comments__inner">
        <section class="pm-comments__section">
          <div class="pm-comments__composer-row">
            <form
              class="pm-comments__form"
              onSubmit={event => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <div class="pm-comments__form-frame">
                <textarea
                  ref={element => {
                    textareaElement = element;
                    resizeTextarea(textareaElement);
                  }}
                  class="pm-comments__textarea"
                  rows="1"
                  value={draft()}
                  maxLength={MAX_COMMENT_BODY_LEN}
                  placeholder="Add a comment..."
                  onFocus={() => {
                    if (!session()?.token) {
                      openAuthModal();
                    }
                  }}
                  onInput={handleDraftInput}
                />

                <div class="pm-comments__composer-trailing">
                  <button
                    type="button"
                    class="pm-comments__utility pm-comments__utility--desktop"
                    disabled
                    title="Emoji reactions are not available yet."
                    aria-label="Emoji reactions are not available yet."
                  >
                    <EmojiIcon />
                  </button>
                  <button
                    type="button"
                    class="pm-comments__utility"
                    disabled
                    title="Media attachments are not available yet."
                    aria-label="Media attachments are not available yet."
                  >
                    <MediaIcon />
                  </button>
                  <button
                    type="submit"
                    class="pm-button pm-button--primary pm-comments__composer-submit"
                    disabled={!canSubmit()}
                  >
                    {submitLabel()}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div class="pm-comments__warning pm-comments__warning--mobile">
            <ShieldIcon />
            <p>Beware of external links.</p>
          </div>

          <div class="pm-comments__toolbar">
            <div class="pm-comments__toolbar-group">
              <button type="button" class="pm-comments__sort-control">
                <span>Newest</span>
                <ChevronDownIcon />
              </button>

              <div class="pm-comments__holders">
                <button
                  type="button"
                  class="pm-comments__holders-box"
                  disabled
                  title="Holders filtering requires holder metadata from the backend."
                />
                <span>Holders</span>
              </div>
            </div>

            <div class="pm-comments__toolbar-side">
              <div class="pm-comments__warning pm-comments__warning--desktop">
                <ShieldIcon />
                <p>Beware of external links.</p>
              </div>
            </div>
          </div>

          <Show when={statusMessage()}>
            <p class="pm-comments__feedback">{statusMessage()}</p>
          </Show>

          <Show when={errorMessage()}>
            <p class="pm-comments__feedback pm-comments__feedback--error">{errorMessage()}</p>
          </Show>

          <Show
            when={comments().length > 0}
            fallback={
              <p class="pm-comments__empty">
                No comments yet. Be the first to share your view on this market.
              </p>
            }
          >
            <div class="pm-comments__thread">
              <For each={visibleComments()}>
                {comment => <CommentNode comment={comment} />}
              </For>
            </div>

            <Show when={hasHiddenComments()}>
              <div class="pm-comments__show-more-wrap">
                <button
                  type="button"
                  class="pm-comments__show-more"
                  onClick={showMoreComments}
                >
                  Show more comments
                </button>
              </div>
            </Show>
          </Show>
        </section>
      </div>
    </section>
  );
}
