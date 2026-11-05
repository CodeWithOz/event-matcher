import mongoose from 'mongoose';
import { PendingCourse } from '@/lib/models/PendingCourse';
import { normalizeTitle, slugFromUrl } from '@/lib/course-sync/catalog';

type CourseIdentity = { url: string; title: string };

/**
 * A course is identified by its URL slug or, to catch slugs renamed on the
 * source site, by its normalized title. The same rule is used by the daily sync.
 */
function matches(identity: CourseIdentity, other: { url?: unknown; title?: unknown }): boolean {
  const slug = slugFromUrl(identity.url);
  const title = normalizeTitle(identity.title);
  const otherSlug = typeof other.url === 'string' ? slugFromUrl(other.url) : null;
  const otherTitle = typeof other.title === 'string' ? normalizeTitle(other.title) : '';
  return (slug !== null && slug === otherSlug) || (title !== '' && title === otherTitle);
}

/**
 * Whether a published course already has this slug or title.
 * The caller must already be connected to MongoDB.
 */
export async function isCoursePublished(identity: CourseIdentity): Promise<boolean> {
  const published = await mongoose.connection
    .collection('courses')
    .find({}, { projection: { url: 1, title: 1 } })
    .toArray();
  return published.some((course) => matches(identity, { url: course.url, title: course.title }));
}

/**
 * Take the queued entries for this course out of the review queue, because the
 * course was published another way (e.g. added by hand). Returns how many were
 * resolved. The caller must already be connected to MongoDB.
 */
export async function resolvePendingForPublishedCourse(identity: CourseIdentity): Promise<number> {
  const open = await PendingCourse.find(
    { status: { $in: ['pending', 'failed'] } },
    { url: 1, catalogTitle: 1, 'importResult.course.title.value': 1 }
  ).lean();

  const ids = open
    .filter(
      (entry) =>
        matches(identity, { url: entry.url, title: entry.catalogTitle }) ||
        matches(identity, { url: entry.url, title: entry.importResult?.course?.title?.value })
    )
    .map((entry) => entry._id);

  if (ids.length === 0) return 0;

  const result = await PendingCourse.updateMany(
    { _id: { $in: ids }, status: { $in: ['pending', 'failed'] } },
    { $set: { status: 'approved', reviewedAt: new Date() } }
  );
  return result.modifiedCount;
}
