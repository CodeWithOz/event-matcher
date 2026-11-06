/**
 * How a course is recognised across URL and title changes.
 *
 * DeepLearning.AI moved its course pages from /short-courses/<slug> to
 * /courses/<slug>, and some slugs were renamed, so two records describe the
 * same course when they share the URL slug or the normalized title.
 *
 * These values are stored on `courses` (slug, normalizedTitle) and
 * `pending_courses` (slug, normalizedTitles) and indexed, so duplicate checks
 * run as MongoDB queries. Every write to those collections must set them.
 *
 * No path-alias imports here: the scripts (ts-node) use this module too.
 */

/** Last path segment of a course URL, e.g. ".../short-courses/foo/" -> "foo". */
export function slugFromUrl(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? last.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Lowercase, accent- and punctuation-free title, e.g. "On-Device AI!" -> "on device ai". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type CourseIdentity = {
  slug: string | null;
  normalizedTitle: string | null;
};

/** The identity fields stored on a course document. */
export function courseIdentity(course: { url?: unknown; title?: unknown }): CourseIdentity {
  const slug = typeof course.url === 'string' ? slugFromUrl(course.url) : null;
  const normalizedTitle = typeof course.title === 'string' ? normalizeTitle(course.title) : '';
  return { slug, normalizedTitle: normalizedTitle || null };
}

/**
 * MongoDB filter matching a course by slug or normalized title; null when
 * the course has neither (nothing can match it).
 */
export function identityFilter(
  identity: CourseIdentity,
  titleField: 'normalizedTitle' | 'normalizedTitles'
): Record<string, unknown> | null {
  const clauses: Record<string, unknown>[] = [];
  if (identity.slug) clauses.push({ slug: identity.slug });
  if (identity.normalizedTitle) clauses.push({ [titleField]: identity.normalizedTitle });
  return clauses.length > 0 ? { $or: clauses } : null;
}
