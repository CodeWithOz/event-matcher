/**
 * The unique index on courses.slug, shared by the Course model and the
 * identity setup (lib/courses/ensure-identity) so both create the same index.
 * No path-alias imports: the backfill script (ts-node) uses this module too.
 */
export const COURSE_SLUG_INDEX = {
  name: 'slug_unique',
  key: { slug: 1 },
  partialFilterExpression: { slug: { $type: 'string' } },
} as const;
