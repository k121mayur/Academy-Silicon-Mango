/**
 * Media URL helpers for the blog editor + renderer.
 *
 * These let an admin paste *any* image link (including Google Drive share links)
 * or a YouTube URL and have it render correctly, both inside the rich-text editor
 * and on the public page.
 */

/**
 * Normalise an image URL so it renders in an <img src>. Most links pass through
 * untouched; Google Drive *share* links (which point at a viewer page, not the
 * raw bytes) are rewritten to the direct-download form so the browser can load
 * them as an image.
 *
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *     → https://drive.google.com/uc?export=view&id=<ID>
 */
export function normalizeImageUrl(url: string): string {
  const raw = (url || "").trim();
  if (!raw) return raw;

  // /file/d/<ID>/...
  const fileMatch = raw.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }
  // open?id=<ID>  or  uc?id=<ID>  (without export=view)
  const idMatch = raw.match(/drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/uc?export=view&id=${idMatch[1]}`;
  }
  return raw;
}

/**
 * Extract the 11-char YouTube video id from any common YouTube URL form
 * (watch?v=, youtu.be/, /embed/, /shorts/). Returns null if not a YouTube URL.
 */
export function extractYouTubeId(url: string): string | null {
  const raw = (url || "").trim();
  if (!raw) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return m[1];
  }
  return null;
}

/** True when the URL is a recognisable YouTube link. */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null;
}

/** Privacy-friendly embed URL for a YouTube video id. */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
