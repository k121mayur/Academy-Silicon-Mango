# Frontend Performance Audit
> Audited against the `/frontend-performance` skill · 2026-06-27

---

## What's Already Good

### 1. Code Splitting — Excellent
All 50+ page routes are lazy-loaded via `React.lazy()` in [src/App.tsx](src/App.tsx).  
Layouts (`PublicLayout`, `AdminLayout`, etc.) are eagerly imported — correct, since they are always needed.

**Manual chunk strategy in [vite.config.ts](vite.config.ts)** isolates every heavy library into its own chunk:

| Chunk | Libraries | Size |
|-------|-----------|------|
| `charts` | recharts + d3-* | ~303 KB |
| `editor` | @tiptap + prosemirror | ~349 KB |
| `pdf` | pdfjs-dist | ~336 KB |
| `pdf.worker` | pdfjs worker | ~1.4 MB |
| `hls` | hls.js | ~511 KB |
| `react` | React + ReactDOM | ~139 KB |
| `query` | TanStack Query | ~47 KB |
| `router` | React Router | ~23 KB |
| `vendor` | axios, zustand, clsx, dompurify… | ~201 KB |

Individual route chunks are 2–24 KB each — tiny.

### 2. Dynamic Imports for Heavy Libraries
- `hls.js` is dynamically imported **only when video playback starts** ([src/components/shared/SecureVideoPlayer.tsx](src/components/shared/SecureVideoPlayer.tsx))
- `pdfjs-dist` is dynamically imported **only when a PDF certificate is previewed** ([src/components/admin/CertificatePreview.tsx](src/components/admin/CertificatePreview.tsx))

### 3. Web Workers via Libraries
- `hls.js` has `enableWorker: true` — segment parsing offloaded off the main thread
- `pdfjs-dist` worker imported asynchronously with `?url` (`pdf.worker.min.mjs`) — PDF rendering off the main thread

### 4. Asset Caching — Correct Strategy
From [nginx.conf](nginx.conf) and [nginx.prod.conf](nginx.prod.conf):

| Asset | Cache-Control | Why |
|-------|--------------|-----|
| `/assets/*` (hashed chunks) | `max-age=31536000, immutable` | Vite fingerprints filenames; safe to cache forever |
| `/index.html` | `no-cache` | Always revalidate so new deploys take effect immediately |
| `/media/seg/*` (HLS segments) | `10 min, immutable` | Segment HMAC bucketing makes them shared across viewers |
| `/uploads/*` | `7 days` | User-uploaded content, rarely changes |

### 5. Gzip Compression
Enabled at level 6 in nginx for all text assets (JS, CSS, JSON, SVG, fonts). `gzip_vary: on` signals CDN to cache compressed variants separately.  
Cloudflare applies Brotli at the edge in production — no server-side Brotli needed.

### 6. GA4 — Properly Deferred
[src/components/Analytics.tsx](src/components/Analytics.tsx):
- Injected dynamically in a `useEffect` (never blocks render)
- Loaded with `async` attribute (never blocks parsing)
- Only loads when `VITE_GA_MEASUREMENT_ID` env var is set — zero impact in dev/staging
- Client-side route changes fire `page_view` events via `useLocation` effect

### 7. Non-Blocking Font Loading
- Google Fonts loaded with `?display=swap` — browser shows fallback text immediately, swaps when font arrives (no invisible text)
- `preconnect` to `fonts.googleapis.com` and `fonts.gstatic.com` in [index.html](index.html) — TLS+DNS resolved before font request fires

### 8. GPU-Friendly Scroll Animations
- [src/hooks/useReveal.ts](src/hooks/useReveal.ts) uses IntersectionObserver — zero JS polling, zero scroll event listeners
- All animations (fade, slide, scale) use `transform` + `opacity` — compositor-thread only, never triggers layout
- `prefers-reduced-motion: reduce` respected globally in [src/index.css](src/index.css) — all animation durations collapse to `0.001ms`

### 9. Query-Level Prefetching
- `BlogCard` and `CourseCard` call `prefetchQuery` on `mouseEnter` — data is warm in TanStack cache before the user clicks
- TanStack Query configured with localStorage persistence ([src/lib/queryClient.ts](src/lib/queryClient.ts)) — stale data serves instantly on repeat visits while revalidation runs in background

### 10. CSP + Security Headers
[nginx.conf](nginx.conf) line 46: Full Content-Security-Policy covering scripts, fonts, images, frames, and connect-src. Third-party integrations (Razorpay, GA, YouTube) are explicitly allow-listed rather than wildcarded.

### 11. HTTP/2 in Production
[nginx.prod.conf](nginx.prod.conf) lines 51–59: TLS 1.2/1.3 with `http2` directive enabled — eliminates head-of-line blocking for concurrent asset requests.

### 12. No Dependency Bloat
`package.json` has 13 direct dependencies. No `lodash` (uses native JS), no `moment` (custom `formatDate` util), no duplicate state libraries. `clsx` + `tailwind-merge` are tree-shakeable.

### 13. ES Module Build Target
Vite targets ES2020 (`build.target`) and Vite itself always emits `<script type="module">` — no transpilation bloat sent to modern browsers. Legacy browsers get nothing (intentional for an LMS app).

### 14. Tailwind Purge — Correct
Content scanning covers `./index.html` and `./src/**/*.{ts,tsx}` — only used CSS classes shipped in production bundle.

---

## What Needs Improvement (Planned — No Changes Made)

### P1 — High Impact

#### 1.1 Image Optimization: No AVIF/WebP, No srcset
**Files:** [src/components/ui/Img.tsx](src/components/ui/Img.tsx), [src/pages/public/Landing.tsx](src/pages/public/Landing.tsx), [src/components/shared/BlogCard.tsx](src/components/shared/BlogCard.tsx)

**What's missing:**
- No `<picture>` with `<source type="image/avif">` / `<source type="image/webp">` fallbacks
- No `srcset` + `sizes` for responsive images
- Hero image in `Landing.tsx` has no explicit `width`/`height` → CLS risk if image loads late
- `Img.tsx` applies `loading="lazy"` globally — if this component is ever used for an LCP image, that delays the most critical metric

**Plan:**
- Extend `Img.tsx` to accept `priority?: boolean` prop that sets `loading="eager"` and `fetchpriority="high"` (for LCP candidates)
- Add `width` and `height` as required/recommended props to prevent CLS
- Wrap `<img>` in `<picture>` when `avif`/`webp` src variants are provided

#### 1.2 LCP Hero Image — Missing fetchpriority
**File:** [src/pages/public/Landing.tsx](src/pages/public/Landing.tsx)

The hero section background image (Unsplash CDN) is the likely LCP element. It is:
- Missing `fetchpriority="high"`
- Missing a `<link rel="preload">` in `index.html`
- An absolute-positioned CSS background-style image (invisible to browser preloaders)

**Plan:**
- Move the hero image to a proper `<img>` or `<picture>` element with `fetchpriority="high"` and no `loading="lazy"`
- Add `<link rel="preload" as="image" href="…" fetchpriority="high">` to [index.html](index.html) for the above-fold hero

#### 1.3 No Real-User Monitoring (RUM)
**What's missing:** No `web-vitals` library; no PerformanceObserver; no LCP/INP/CLS data sent to GA4 or any endpoint.

Without RUM, there is no production signal on actual user experience. Lab scores (Lighthouse) may not reflect real user devices or network conditions.

**Plan:**
- Add `web-vitals` package (1.5 KB gzipped, tree-shakeable)
- Wire `onLCP`, `onINP`, `onCLS` into the existing GA4 flow in [src/components/Analytics.tsx](src/components/Analytics.tsx) via `gtag("event", …)`
- No new infrastructure needed — data flows into the existing GA4 property

---

### P2 — Medium Impact

#### 2.1 Font: No unicode-range Subsetting
**File:** [index.html](index.html) (Google Fonts URL)

All weights of Inter (400–700), Manrope (500–800), and JetBrains Mono (400–500) are downloaded with full character coverage. Adding `&subset=latin` or `unicode-range: U+0000-00FF` to the Google Fonts URL reduces each font file by ~60–80%.

**Plan:**
- Append `&subset=latin` to the Google Fonts URL (covers all English + common accented characters)
- Or switch to self-hosted fonts with explicit `unicode-range` in `@font-face` declarations in `index.css`

#### 2.2 No `<link rel="prefetch">` for Likely Next Pages
**File:** [index.html](index.html)

Users landing on the homepage will almost certainly navigate to `/courses` or `/login`. No prefetch hints are set.

**Plan:**
- Add `<link rel="prefetch" href="/login">` and `<link rel="prefetch" href="/courses">` to `index.html`
- Or implement Speculation Rules API for Chrome 109+ with a `prefetch` rule for `a[href^="/courses"]` and `a[href^="/login"]`
- Keep `prefetch` only (not `prerender`) — `prerender` has high memory cost on a 6 GB box

#### 2.3 Material Symbols Font: display=block
**File:** [index.html](index.html) line 59

The Material Symbols icon font uses `display=block` — text is invisible until it loads. For icon fonts this causes flash of invisible icons. Since this is a small (~60 KB) icon font loaded from Google CDN, it's a minor issue, but switching to `display=swap` or `display=fallback` is trivial.

**Plan:**
- Change `display=block` to `display=fallback` in the Material Symbols font URL

#### 2.4 No Bundle Analyzer / CI Performance Budget
**File:** [vite.config.ts](vite.config.ts)

There is no `vite-bundle-visualizer` or `rollup-plugin-visualizer` configured. The current chunk warning threshold is 1200 KB (very high). Without a visualizer or budget, bundle growth goes undetected.

**Plan:**
- Add `rollup-plugin-visualizer` as a dev dependency, enabled via `ANALYZE=true` env flag in vite.config
- Reduce chunk warning threshold from 1200 KB to 600 KB to catch regressions earlier
- Optionally: add `lighthouse-ci` with a performance budget to CI pipeline

#### 2.5 No List Virtualization for Large Tables
**Files:** Admin enrollment tables, payment history, student lists

Large datasets (e.g., all enrolled students in a batch, full payment history) render fully into the DOM. For the stated 50–70 concurrent user scale this is acceptable today, but a batch with 100+ students will produce 100+ DOM rows.

**Plan (deferred):**
- Evaluate `@tanstack/react-virtual` for the most data-dense admin tables
- Only pursue if profiling shows slow interaction times on these pages

---

### P3 — Low / Nice-to-Have

#### 3.1 Variable Fonts
Currently three separate font families with individual weight files. Switching to the variable-font variants of Inter and Manrope would reduce the total number of font network requests and file sizes.

#### 3.2 Service Worker / Offline Support
No SW registered. TanStack Query's localStorage persistence gives a partial "stale-while-revalidate" experience, but the app shell (HTML, CSS, JS) is not cached for offline. For this deployment target (LMS used on campus/clinic networks that may be unreliable), a minimal Workbox precache of the app shell could improve resilience.

#### 3.3 React.memo / useMemo for Hot Components
Cards, table rows, and list items that render many times (course cards, student rows) have no memoization. For the current scale this is fine, but if lists grow and profiling reveals wasted renders, targeted `React.memo` on card components would help.

#### 3.4 Speculation Rules API (Chrome 109+)
A more modern alternative to `<link rel="prefetch">`. Allows declarative prefetch/prerender by URL pattern or CSS selector. Could replace the mouse-hover TanStack `prefetchQuery` pattern for navigation prefetching on the public site.

---

## Summary Table

| Area | Status | Priority |
|------|--------|----------|
| Route-level code splitting | ✅ Done | — |
| Library chunk isolation | ✅ Done | — |
| Dynamic imports (hls.js, pdfjs) | ✅ Done | — |
| Web Workers (via hls.js, pdfjs) | ✅ Done | — |
| Asset caching (1-year immutable) | ✅ Done | — |
| Gzip compression + Cloudflare Brotli | ✅ Done | — |
| GA4 deferred loading | ✅ Done | — |
| Non-blocking font loading | ✅ Done | — |
| GPU-only animations + reduced-motion | ✅ Done | — |
| HTTP/2 in production | ✅ Done | — |
| TanStack Query prefetch on hover | ✅ Done | — |
| CSP + security headers | ✅ Done | — |
| No dependency bloat | ✅ Done | — |
| Image AVIF/WebP / srcset | ❌ Missing | P1 |
| LCP hero fetchpriority + preload | ❌ Missing | P1 |
| Real-user monitoring (web-vitals) | ❌ Missing | P1 |
| Font unicode-range subsetting | ❌ Missing | P2 |
| Prefetch hints for likely next pages | ❌ Missing | P2 |
| Material Symbols display=block → fallback | ❌ Missing | P2 |
| Bundle analyzer + CI performance budget | ❌ Missing | P2 |
| List virtualization | ⚠️ Deferred | P2 |
| Variable fonts | ⚠️ Optional | P3 |
| Service Worker / offline app shell | ⚠️ Optional | P3 |
| React.memo on card components | ⚠️ Optional | P3 |
| Speculation Rules API | ⚠️ Optional | P3 |

---

## Key Files Reference

| File | Relevance |
|------|-----------|
| [index.html](index.html) | Resource hints, font loading, preloads, splash markup |
| [vite.config.ts](vite.config.ts) | manualChunks, build target, chunk thresholds |
| [tailwind.config.ts](tailwind.config.ts) | Content purge, animation keyframes |
| [src/App.tsx](src/App.tsx) | All React.lazy() route splits, Suspense boundary |
| [src/components/ui/Img.tsx](src/components/ui/Img.tsx) | Image component (lazy/async defaults) |
| [src/pages/public/Landing.tsx](src/pages/public/Landing.tsx) | LCP hero image location |
| [src/components/Analytics.tsx](src/components/Analytics.tsx) | GA4 deferred injection, RUM hook point |
| [src/hooks/useReveal.ts](src/hooks/useReveal.ts) | IntersectionObserver scroll-reveal |
| [src/lib/queryClient.ts](src/lib/queryClient.ts) | TanStack Query persistence config |
| [src/components/shared/SecureVideoPlayer.tsx](src/components/shared/SecureVideoPlayer.tsx) | hls.js dynamic import, enableWorker |
| [src/components/admin/CertificatePreview.tsx](src/components/admin/CertificatePreview.tsx) | pdfjs dynamic import + worker |
| [nginx.conf](nginx.conf) | Gzip, cache headers, CSP (dev/local) |
| [nginx.prod.conf](nginx.prod.conf) | HTTP/2, TLS, Cloudflare origin pull, cache |
| [package.json](package.json) | Dependency inventory |
