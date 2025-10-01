// scraper.js
// Run: node scraper.js --url="<public-linkedin-post-url>" [--maxComments=10] [--headed] [--snapshot]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { selectors } from './selectors.js';

// ----------------- CLI -----------------
const argv = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const URL_IN   = argv.url;
const MAX      = Number(argv.maxComments ?? 10);
const HEADED   = argv.headed === true || argv.headed === 'true';
const SNAPSHOT = argv.snapshot === true || argv.snapshot === 'true';

if (!URL_IN) {
  console.error('Usage: node scraper.js --url="<public-linkedin-post-url>" [--maxComments=10] [--headed] [--snapshot]');
  process.exit(1);
}

// ----------------- Helpers -----------------
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
const nowISO = () => new Date().toISOString();
const tsForFile = () => new Date().toISOString().replace(/[:.]/g, '-');

// Default-on normalization (fixes bullets/quotes/mojibake in plain text)
function normalizeText(s = '') {
  return String(s)
    .replace(/\u00A0|┬á|Â/g, ' ')
    .replace(/ÔÇÖ/g, "'").replace(/\u2019/g, "'")
    .replace(/ÔÇ£|ÔÇØ/g, '"').replace(/\u201C|\u201D/g, '"')
    .replace(/ÔÇó/g, '•')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseKM(str) {
  if (!str) return 0;
  const s = String(str).toUpperCase().replace(/[, ]+/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)([KM])?/);
  if (!m) return 0;
  let n = Number(m[1] || 0);
  if (m[2] === 'K') n *= 1_000;
  if (m[2] === 'M') n *= 1_000_000;
  return Math.round(n);
}

// Parse "likes/comments" from guest-visible summary like "523 Reactions | 288 Comments"
function parseCounts(countsRaw) {
  const out = { likes: null, comments_count: null };
  if (!countsRaw) return out;
  const s = countsRaw.toLowerCase();

  const cm = s.match(/([\d.,\skm]+)\s*comments?/);
  if (cm) out.comments_count = parseKM(cm[1]);

  const lm = s.match(/([\d.,\skm]+)\s*(reactions?|likes?)/);
  if (lm) out.likes = parseKM(lm[1]);

  if (out.likes == null || out.comments_count == null) {
    const tokens = (s.match(/[\d.,]+\s*[km]?/gi) || []).map(t => t.trim());
    if (out.likes == null && tokens[0]) out.likes = parseKM(tokens[0]);
    if (out.comments_count == null && tokens[1]) out.comments_count = parseKM(tokens[1]);
  }
  return out;
}

async function clickIfVisible(page, sel) {
  const loc = page.locator(sel).first();
  const count = await loc.count();
  if (!count) return false;
  try { await loc.click({ timeout: 1200 }); return true; } catch { return false; }
}

// ----------------- Authwall Guard -----------------
const AUTHWALL_DIALOG_SEL = [
  'div[role="dialog"][aria-modal="true"]',
  '.artdeco-modal',
  '#authwall-sign-in',
  '#authwall-join',
  '[data-test-id="authwall"]',
].join(',');

const AUTHWALL_DISMISS_BTNS = [
  'button[aria-label="Dismiss"]',
  'button[aria-label="Close"]',
  '.artdeco-modal__dismiss',
  '.sign-in-modal__dismiss',
  '.join-form__dismiss',
];

async function isAuthwallPresent(page) {
  try {
    const c = await page.locator(AUTHWALL_DIALOG_SEL).count();
    return c > 0;
  } catch { return false; }
}

async function dismissAuthwall(page) {
  let dismissed = false;
  for (const sel of AUTHWALL_DISMISS_BTNS) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try { await loc.click({ timeout: 1000 }); dismissed = true; console.log('[AUTHWALL] Clicked dismiss:', sel); break; } catch {}
    }
  }
  if (!dismissed) {
    try { await page.keyboard.press('Escape'); dismissed = true; console.log('[AUTHWALL] Sent Escape'); } catch {}
  }
  if (!dismissed) {
    try { await page.mouse.click(10, 10); dismissed = true; console.log('[AUTHWALL] Clicked backdrop'); } catch {}
  }
  await page.waitForTimeout(300);
  return dismissed;
}

async function ensureNoAuthwall(page, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    if (!(await isAuthwallPresent(page))) return true;
    console.log('[AUTHWALL] Detected. Dismissing… (attempt %d/%d)', i + 1, attempts);
    await dismissAuthwall(page);
    await page.waitForTimeout(400);
  }
  const still = await isAuthwallPresent(page);
  if (still) console.log('[AUTHWALL] Still present after attempts.');
  return !still;
}

// ----------------- Expanders -----------------
async function tryCookieConsent(page) {
  console.log('[INFO] Trying cookie consent buttons…');
  for (const sel of selectors.cookieAcceptButtons) {
    if (await clickIfVisible(page, sel)) {
      console.log(`[INFO] Clicked cookie button: ${sel}`);
      break;
    }
  }
}

async function expandPostText(page) {
  console.log('[INFO] Expanding post text…');
  for (let i = 0; i < 3; i++) {
    await ensureNoAuthwall(page);
    for (const sel of selectors.showMoreTextButtons) {
      const did = await clickIfVisible(page, sel);
      if (did) console.log(`[DEBUG] Clicked post "see more": ${sel}`);
    }
    await page.mouse.wheel(0, 1000);
    await sleep(300);
  }
}

// Guest pages: avoid “see more comments” that forces login.
// Strategy: deep scroll + guard; target many containers so we can sort by engagement.
async function expandComments(page, target = 60, maxLoops = 14) {
  console.log('[INFO] Scrolling to load as many comments as possible… target=%d', target);
  for (let i = 0; i < maxLoops; i++) {
    await ensureNoAuthwall(page);
    await page.mouse.wheel(0, 2400);
    await sleep(650);
    const count = await page.locator(selectors.commentItemCandidates.join(',')).count().catch(() => 0);
    console.log(`[DEBUG] Visible comment containers: ${count}`);
    if (count >= target) break;
  }
}

// ----------------- Extraction -----------------
async function extractPost(page) {
  console.log('[INFO] Extracting post meta + content-only HTML…');
  return await page.evaluate((selectors) => {
    const norm = s => (s || '').replace(/\u00A0/g, ' ').trim();

    const scope =
      document.querySelector(selectors.postContainerCandidates.join(',')) ||
      document.querySelector(selectors.postRoot) ||
      document;

    // 1) TEXT
    let textEl = null;
    for (const sel of selectors.postTextCandidates) {
      const n = scope.querySelector(sel);
      if (n && norm(n.innerText).length > 10) { textEl = n; break; }
    }

    // 2) MEDIA (optional)
    let mediaEl = null;
    for (const sel of selectors.postMediaCandidates) {
      const n = scope.querySelector(sel);
      if (n) { mediaEl = n; break; }
    }

    // Build minimal content-only HTML
    const wrapper = document.createElement('div');
    wrapper.className = 'post-content';
    if (textEl) wrapper.appendChild(textEl.cloneNode(true));
    if (mediaEl) {
      const media = mediaEl.cloneNode(true);
      media.querySelectorAll('img[data-delayed-url]').forEach(img => {
        if (!img.getAttribute('src')) img.setAttribute('src', img.getAttribute('data-delayed-url'));
      });
      wrapper.appendChild(media);
    }

    // Author
    let author_name = '';
    let author_handle = '';
    for (const sel of selectors.postAuthorCandidates) {
      const a = document.querySelector(sel);
      if (a && norm(a.textContent)) {
        author_name = norm(a.textContent);
        const href = a.getAttribute('href') || '';
        const m = href.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (m) author_handle = m[1];
        break;
      }
    }

    // Time
    let posted_at = '';
    for (const sel of selectors.postTimeCandidates) {
      const t = document.querySelector(sel);
      if (t?.getAttribute?.('datetime')) { posted_at = t.getAttribute('datetime'); break; }
      if (t?.getAttribute?.('title')) { posted_at = t.getAttribute('title'); break; }
      if (t?.textContent && /\d/.test(t.textContent)) { posted_at = norm(t.textContent); break; }
    }

    // Counts (guest layout)
    const countsText = Array.from(document.querySelectorAll(
      '[data-test-id="social-actions__reactions"], [data-test-id="social-actions__comments"], .social-detail__numbers, [aria-label*="reactions"]'
    ))
      .map(n => norm(n.textContent)).filter(Boolean).join(' | ') || null;

    const post_text = norm(
      textEl?.innerText ||
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      ''
    );

    return {
      url: location.href,
      author_name,
      author_handle,
      posted_at,
      post_text,
      post_html: wrapper.innerHTML, // CONTENT-ONLY ✅
      likes: null,
      impressions: null,
      comments_count: null,
      counts_raw: countsText,
    };
  }, selectors);
}

async function extractComments(page) {
  console.log('[INFO] Extracting comments…');
  return await page.evaluate((selectors) => {
    const norm = s => (s || '').replace(/\u00A0/g, ' ').trim();

    function grabRepliesCount(el) {
      // Look for text like "3 Replies" / "1 Reply" anywhere inside the comment footer
      const txt = norm(el.innerText || '');
      const m = txt.match(/(\d+(?:\.\d+)?)[\s\u00A0]*(?:Replies?|repl(?:y|ies))/);
      if (!m) return 0;
      const raw = m[1];
      const s = raw.toUpperCase();
      if (s.endsWith('K')) return Math.round(parseFloat(s) * 1_000);
      if (s.endsWith('M')) return Math.round(parseFloat(s) * 1_000_000);
      return Number(raw.replace(/[^\d.]/g, '')) || 0;
    }

    const items = [];
    const nodes = document.querySelectorAll(selectors.commentItemCandidates.join(','));
    nodes.forEach((el, idx) => {
      // text
      let text = '';
      for (const sel of selectors.commentTextCandidates) {
        const n = el.querySelector(sel);
        if (n && norm(n.innerText)) { text = norm(n.innerText); break; }
      }
      if (!text) return;

      // author
      let author_name = '';
      let author_handle = '';
      for (const sel of selectors.commentAuthorCandidates) {
        const a = el.querySelector(sel);
        if (a && norm(a.textContent)) {
          author_name = norm(a.textContent);
          const href = a.getAttribute('href') || '';
          const m = href.match(/linkedin\.com\/in\/([^/?#]+)/i);
          if (m) author_handle = m[1];
          break;
        }
      }

      // likes (guest view shows "X Reactions")
      const likeNode = el.querySelector('a.comment__reactions-count');
      const likesText = likeNode ? norm(likeNode.textContent) : '';

      // replies (best-effort)
      const replies = grabRepliesCount(el);

      // time
      const timeNode = el.querySelector('span.comment__duration-since, time');
      const commented_at = norm(timeNode?.textContent || '');

      // id (best-effort)
      const urnAttr = el.querySelector('[data-semaphore-content-urn]')?.getAttribute('data-semaphore-content-urn') || '';
      const urnMatch = urnAttr.match(/comment:\(([^,]+),(\d+)\)/);
      const comment_id = urnMatch ? urnMatch[2] : `auto-${idx}`;

      items.push({
        comment_id,
        author_name,
        author_handle,
        comment_text: text,
        comment_html: el.outerHTML,
        commented_at,
        likes_text: likesText,
        replies_hint: replies
      });
    });
    return items;
  }, selectors);
}

// ----------------- Main -----------------
(async () => {
  console.log(`[START] ${nowISO()} | URL=${URL_IN} | maxComments=${MAX} | headed=${HEADED} | snapshot=${SNAPSHOT}`);
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();

  try {
    page.setDefaultTimeout(45000);

    console.log('[NAV] goto…');
    await page.goto(URL_IN, { waitUntil: 'domcontentloaded', timeout: 90000 });

    await tryCookieConsent(page);
    await ensureNoAuthwall(page);

    console.log('[WAIT] networkidle settle…');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await ensureNoAuthwall(page);

    await expandPostText(page);
    await expandComments(page); // loads *many* comments so we can sort

    // Extract
    const post = await extractPost(page);
    console.log('[INFO] Post extracted. author="%s", posted_at="%s", textLen=%d, htmlLen=%d',
      post.author_name, post.posted_at, (post.post_text || '').length, (post.post_html || '').length);

    const rawComments = await extractComments(page);
    console.log('[INFO] Raw comments visible: %d', rawComments.length);

    // Parse counts into numbers (best-effort guest parsing)
    const counts = parseCounts(post.counts_raw);

    // Build + normalize comments; compute engagement = likes + 2*replies
    const commentsAll = rawComments.map((c) => {
      const likes = parseKM(c.likes_text);
      const replies = Number(c.replies_hint || 0);
      const engagement_score = likes + 2 * replies;
      return {
        comment_id: c.comment_id,
        author_name: normalizeText(c.author_name),
        author_handle: c.author_handle || '',
        comment_text: normalizeText(c.comment_text),
        comment_html: c.comment_html || '',
        commented_at: c.commented_at || '',
        likes,
        replies_count: replies,
        engagement_score,
      };
    });

    // Sort by engagement and take the top N
    const comments = commentsAll
      .sort((a, b) => b.engagement_score - a.engagement_score)
      .slice(0, MAX)
      .map((c, i) => ({ ...c, rank_in_post: i + 1 }));

    const out = {
      post: {
        url: post.url,
        author_name: normalizeText(post.author_name),
        author_handle: post.author_handle || '',
        posted_at: post.posted_at || '',
        post_text: normalizeText(post.post_text || ''),     // ✅ normalization ON by default
        post_html: post.post_html || '',
        impressions: post.impressions,
        likes: counts.likes ?? post.likes,
        comments_count: counts.comments_count ?? post.comments_count,
        counts_raw: post.counts_raw,
        scraped_at: nowISO(),
      },
      comments,
      meta: {
        note: 'Public DOM scrape (no login). Selectors heuristic. Authwall guarded. Sorted by engagement.',
        version: 'dom-public-v4',
        scraped_at: nowISO(),
      }
    };

    // Debug snapshots
    if (SNAPSHOT) {
      const base = `debug-${tsForFile()}`;
      await page.screenshot({ path: `${base}.png`, fullPage: true });
      await fs.writeFile(`${base}.html`, await page.content(), 'utf8');
      console.log(`[DEBUG] Wrote ${base}.png and ${base}.html`);
    }

    console.log('[DONE] postTextLen=%d | postHtmlLen=%d | commentsCollected=%d | commentsReturned=%d (top by engagement) | likes=%s | comments_count=%s',
      out.post.post_text.length, out.post.post_html.length, commentsAll.length, out.comments.length, out.post.likes, out.post.comments_count);

    // Print JSON to stdout (so n8n can capture)
    process.stdout.write(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('[ERROR]', err?.message || String(err));
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
