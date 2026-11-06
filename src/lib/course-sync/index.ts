import mongoose from 'mongoose';
import { importCourseFromUrl } from '@/lib/course-import';
import { MAX_IMPORT_ATTEMPTS, PendingCourse } from '@/lib/models/PendingCourse';
import { COURSE_BASE_URL, fetchReleasedShortCourses } from '@/lib/course-sync/catalog';
import { normalizeTitle } from '@/lib/courses/identity';
import { ensureCourseIdentity } from '@/lib/courses/ensure-identity';

export type SyncOptions = {
  /** Most courses imported in one run (each import costs an LLM call). */
  maxImports: number;
  /** Epoch ms after which no new import is started (keeps the run inside the function timeout). */
  deadline: number;
  /** Pause between two course page fetches, to stay polite with the source site. */
  delayMs?: number;
};

export type SyncSummary = {
  catalogShortCourses: number;
  alreadyKnown: number;
  candidates: number;
  imported: string[];
  failed: Array<{ slug: string; error: string }>;
  /** Candidates left for the next runs. */
  remaining: number;
};

/** Distinct normalized titles of a queued course (catalog name, imported title). */
const titlesOf = (...titles: Array<string | null | undefined>) => [
  ...new Set(titles.filter((t): t is string => Boolean(t)).map(normalizeTitle).filter(Boolean)),
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Find released short courses that are neither published nor already queued,
 * import up to `maxImports` of them (newest first) and queue them for review.
 * The caller must already be connected to MongoDB.
 */
export async function syncShortCourses(options: SyncOptions): Promise<SyncSummary> {
  const { maxImports, deadline, delayMs = 2000 } = options;

  const shortCourses = await fetchReleasedShortCourses();

  const courses = mongoose.connection.collection('courses');

  // Older documents may lack the identity fields the checks below rely on
  await ensureCourseIdentity();

  const catalogTitle = (entry: { name: string | null }) => (entry.name ? normalizeTitle(entry.name) : '');
  const slugs = shortCourses.map((entry) => entry.slug);
  const titles = shortCourses.map(catalogTitle).filter(Boolean);

  // Only the catalog courses that are already published come back from the database
  // (matched by slug, or by title to catch slugs renamed on the source site)
  const published = await courses
    .find(
      { $or: [{ slug: { $in: slugs } }, { normalizedTitle: { $in: titles } }] },
      { projection: { _id: 0, slug: 1, normalizedTitle: 1 } }
    )
    .toArray();
  const publishedSlugs = new Set(published.map((c) => c.slug));
  const publishedTitles = new Set(published.map((c) => c.normalizedTitle));

  const queued = new Map(
    (await PendingCourse.find({ slug: { $in: slugs } }, { slug: 1, status: 1, attempts: 1 }).lean()).map(
      (p) => [p.slug, p]
    )
  );

  const candidates = shortCourses.filter((entry) => {
    if (publishedSlugs.has(entry.slug) || publishedTitles.has(catalogTitle(entry))) return false;
    const existing = queued.get(entry.slug);
    if (!existing) return true;
    return existing.status === 'failed' && existing.attempts < MAX_IMPORT_ATTEMPTS;
  });

  const summary: SyncSummary = {
    catalogShortCourses: shortCourses.length,
    alreadyKnown: shortCourses.length - candidates.length,
    candidates: candidates.length,
    imported: [],
    failed: [],
    remaining: candidates.length,
  };

  for (const entry of candidates) {
    if (summary.imported.length + summary.failed.length >= maxImports) break;
    if (Date.now() >= deadline) break;
    if (summary.imported.length + summary.failed.length > 0) await sleep(delayMs);

    const url = COURSE_BASE_URL + entry.slug;
    const base = {
      $setOnInsert: { slug: entry.slug, url },
      $inc: { attempts: 1 },
    };

    try {
      const result = await importCourseFromUrl(url);
      // The HTML preview is only useful while debugging in the form; don't store it
      delete result.rawHtmlPreview;

      await PendingCourse.updateOne(
        { slug: entry.slug },
        {
          ...base,
          $set: {
            status: 'pending',
            catalogTitle: entry.name,
            normalizedTitles: titlesOf(entry.name, result.course.title.value),
            releasedAt: entry.releasedAt,
            importResult: result,
            error: null,
          },
        },
        { upsert: true }
      );
      summary.imported.push(entry.slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[course-sync] Import failed', { slug: entry.slug, message });

      await PendingCourse.updateOne(
        { slug: entry.slug },
        {
          ...base,
          $set: {
            status: 'failed',
            catalogTitle: entry.name,
            normalizedTitles: titlesOf(entry.name),
            releasedAt: entry.releasedAt,
            error: message,
          },
        },
        { upsert: true }
      );
      summary.failed.push({ slug: entry.slug, error: message });
    }
    summary.remaining -= 1;
  }

  return summary;
}
