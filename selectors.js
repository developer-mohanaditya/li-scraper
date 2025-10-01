// selectors.js
export const selectors = {
  // ---- ROOT / SCOPING ----
  postRoot: 'main, body',

  // ---- POST CONTENT (content-only capture) ----
  // Primary rich-text block for the post body
  postTextCandidates: [
    'p.attributed-text-segment-list__content[data-test-id="main-feed-activity-card__commentary"]',
    'div.update-components-text span[dir="ltr"]',
    'article [data-test-id="post-content"] [dir="ltr"]',
    '.feed-shared-update-v2__description [dir="ltr"]'
  ],
  // Optional media blocks attached to the post
  postMediaCandidates: [
    'ul.feed-images-content',
    'div.update-components-image',
    'div.update-components-video'
  ],
  // Containers used only to scope queries (we still output content-only HTML)
  postContainerCandidates: [
    'article.feed-shared-update-v2',
    'article[role="article"]',
    'section[data-test-id*="activity"]',
    'section'
  ],

  // ---- POST META ----
  postAuthorCandidates: [
    'a[data-tracking-control-name="public_post_feed-actor-name"]',
    'a[data-test-app-aware-link="true"][href*="/in/"]',
    'a[href*="linkedin.com/in/"]',
    '.update-components-actor__name span[aria-hidden="true"]',
    '.feed-shared-actor__name'
  ],
  postTimeCandidates: [
    'time[datetime]',
    'a time[datetime]',
    'time',
    'span[aria-label*="ago"]'
  ],

  // ---- COMMENTS (public guest layout) ----
  // Each top-level visible comment block
  commentItemCandidates: [
    'section.comment',
    'section.comment-with-action'
  ],
  commentAuthorCandidates: [
    'a[data-tracking-control-name="public_post_comment_actor-name"]',
    'a[href*="/in/"]'
  ],
  commentTextCandidates: [
    'p.attributed-text-segment-list__content.comment__text',
    '[dir="ltr"].comment__text'
  ],
  // Reactions/likes badge (guest UI)
  commentLikeCountCandidates: [
    'a.comment__reactions-count',
    '[data-test-reactions-count]',
    'button[aria-label*="Like"] span'
  ],
  commentTimeCandidates: [
    'span.comment__duration-since',
    'time'
  ],

  // ---- EXPANDERS / CONSENT ----
  showMoreTextButtons: [
    'button:has-text("… more")',
    'button:has-text("... more")',
    'button:has-text("see more")',
    'button[aria-label*="see more"]'
  ],
  cookieAcceptButtons: [
    'button:has-text("Accept")',
    'button:has-text("I agree")'
  ]
};
