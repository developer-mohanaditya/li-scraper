// selectors.js
export const selectors = {
  // Root (fallbacks kept just in case)
  postRoot: 'main, body',

  // --- POST CONTENT (public guest layout) ---
  // Rich text block for the post's body (content-only)
  postTextCandidates: [
    'p.attributed-text-segment-list__content[data-test-id="main-feed-activity-card__commentary"]',
    'div.update-components-text span[dir="ltr"]',
    'article [data-test-id="post-content"] [dir="ltr"]',
  ],
  // Optional media (images/video) that belong to the post content
  postMediaCandidates: [
    'ul.feed-images-content',
    'div.update-components-image',
    'div.update-components-video',
  ],
  // Container candidates used only to scope queries if needed
  postContainerCandidates: [
    'article.feed-shared-update-v2',
    'article[role="article"]',
    'section[data-test-id*="activity"]',
    'section',
  ],

  // --- POST META ---
  postAuthorCandidates: [
    'a[data-tracking-control-name="public_post_feed-actor-name"]',
    'a[data-test-app-aware-link="true"][href*="/in/"]',
    'a[href*="linkedin.com/in/"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.feed-shared-actor__name',
  ],
  postTimeCandidates: [
    'time[datetime]',
    'a time[datetime]',
    'time',
    'span[aria-label*="ago"]',
  ],

  // --- COMMENTS (public guest layout) ---
  // On public guest pages, each comment is rendered as <section class="comment ...">
  commentItemCandidates: [
    'section.comment',
    'section.comment-with-action',
  ],
  commentAuthorCandidates: [
    'a[data-tracking-control-name="public_post_comment_actor-name"]',
    'a[href*="/in/"]',
  ],
  commentTextCandidates: [
    'p.attributed-text-segment-list__content.comment__text',
    '[dir="ltr"].comment__text',
  ],
  commentLikeCountCandidates: [
    'a.comment__reactions-count', // e.g., "7 Reactions"
  ],
  commentTimeCandidates: [
    'span.comment__duration-since', // e.g., "9h"
    'time',
  ],

  // --- EXPANDERS / BANNERS ---
  showMoreTextButtons: [
    'button:has-text("… more")',
    'button:has-text("... more")',
    'button:has-text("see more")',
    'button[aria-label*="see more"]',
  ],
  cookieAcceptButtons: [
    'button:has-text("Accept")',
    'button:has-text("I agree")',
  ],
};
