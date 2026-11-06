/**
 * Reads the DeepLearning.AI course catalog.
 *
 * The catalog page (https://www.deeplearning.ai/courses) embeds every course as
 * structured data in its Next.js payload, with a `type` field that tells short
 * courses (`short_course`) apart from long courses (`course`) and
 * specializations (`specialization`). One request gives the whole list.
 */

export const CATALOG_URL = 'https://www.deeplearning.ai/courses';
export const COURSE_BASE_URL = 'https://www.deeplearning.ai/courses/';

export type CatalogEntry = {
  slug: string;
  name: string | null;
  type: string;
  comingSoon: boolean;
  releasedAt: Date | null;
};

// How far after a `"slug"` key the fields of the same entry are looked for.
const ENTRY_WINDOW = 800;

/**
 * The course data sits in JavaScript string literals inside script tags
 * (`self.__next_f.push([1,"..."])`), so it is escaped twice: `\"` for quotes,
 * `\u0026` for "&", etc. Decode those literals to get the raw payload text.
 */
function decodePayload(html: string): string {
  const literals = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g);
  const chunks: string[] = [];
  for (const [, literal] of literals) {
    try {
      chunks.push(JSON.parse(literal));
    } catch {
      // Not valid JSON string syntax: skip this chunk
    }
  }
  // Fallback if the page stops using this format: undo the quote escaping only
  return chunks.length > 0 ? chunks.join('') : html.replace(/\\"/g, '"');
}

/** Decode the JSON escapes left in a string value (e.g. \" or \u00e9). */
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

/**
 * Extract catalog entries from the catalog page HTML: find each course's
 * `"slug"` key and read the fields that follow it.
 */
export function parseCatalog(html: string): CatalogEntry[] {
  const text = decodePayload(html);
  const entries = new Map<string, CatalogEntry>();
  const slugPattern = /"slug":"([a-z0-9-]+)"/g;

  for (const match of text.matchAll(slugPattern)) {
    const slug = match[1];
    if (entries.has(slug)) continue;

    const start = (match.index ?? 0) + match[0].length;
    // Stop at the next entry so fields are never borrowed from a neighbour
    const nextSlug = text.indexOf('"slug":"', start);
    const end = Math.min(start + ENTRY_WINDOW, nextSlug === -1 ? text.length : nextSlug);
    const window = text.slice(start, end);

    const type = window.match(/^,"name":"(?:[^"\\]|\\.)*","type":"([a-z_]+)"/)?.[1]
      ?? window.match(/"type":"([a-z_]+)"/)?.[1];
    // Only entries carrying a release flag are courses (other objects also have slugs)
    const comingSoon = window.match(/"comingSoon":(true|false)/)?.[1];
    if (!type || comingSoon === undefined) continue;

    const rawName = window.match(/^,"name":"((?:[^"\\]|\\.)*)"/)?.[1];
    const name = rawName ? decodeJsonString(rawName).trim() || null : null;
    const releasedRaw = window.match(/"releasedAt":"([^"]+)"/)?.[1];
    const releasedAt = releasedRaw ? new Date(releasedRaw) : null;

    entries.set(slug, {
      slug,
      name,
      type,
      comingSoon: comingSoon === 'true',
      releasedAt: releasedAt && !Number.isNaN(releasedAt.getTime()) ? releasedAt : null,
    });
  }

  return [...entries.values()];
}

/** Fetch the catalog and return its released short courses, newest first. */
export async function fetchReleasedShortCourses(): Promise<CatalogEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let html: string;
  try {
    const response = await fetch(CATALOG_URL, {
      headers: {
        'User-Agent': 'CourseImporterBot/1.0 (+https://event-matcher-admin)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Catalog returned status ${response.status}`);
    }
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  const entries = parseCatalog(html);
  const shortCourses = entries.filter((e) => e.type === 'short_course' && !e.comingSoon);

  // A page with no short courses means the site layout changed: fail loudly
  // instead of silently reporting "nothing new".
  if (shortCourses.length === 0) {
    throw new Error(
      `No short courses found in the catalog (${entries.length} entries parsed); the page structure may have changed`
    );
  }

  return shortCourses.sort(
    (a, b) => (b.releasedAt?.getTime() ?? 0) - (a.releasedAt?.getTime() ?? 0)
  );
}

/** Last path segment of a course URL, e.g. ".../short-courses/foo/" -> "foo". */
export function slugFromUrl(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.at(-1)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** Lowercase, punctuation-free title used to spot renamed slugs of the same course. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
