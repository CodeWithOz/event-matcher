import mongoose from 'mongoose';
import { PendingCourse } from '@/lib/models/PendingCourse';
import { courseIdentity, identityFilter } from '@/lib/courses/identity';
import { ensureCourseIdentity } from '@/lib/courses/ensure-identity';

type CourseRef = { url: string; title: string };

/**
 * Whether a published course already has this slug or normalized title.
 * Runs as one indexed query. The caller must already be connected to MongoDB.
 */
export async function isCoursePublished(course: CourseRef): Promise<boolean> {
  const filter = identityFilter(courseIdentity(course), 'normalizedTitle');
  if (!filter) return false;
  await ensureCourseIdentity();

  const match = await mongoose.connection
    .collection('courses')
    .findOne(filter, { projection: { _id: 1 } });
  return match !== null;
}

/**
 * Take the queued entries for this course out of the review queue, because the
 * course was published another way (e.g. added by hand). Returns how many were
 * resolved. The caller must already be connected to MongoDB.
 */
export async function resolvePendingForPublishedCourse(course: CourseRef): Promise<number> {
  const filter = identityFilter(courseIdentity(course), 'normalizedTitles');
  if (!filter) return 0;
  await ensureCourseIdentity();

  const result = await PendingCourse.updateMany(
    { status: { $in: ['pending', 'failed'] }, ...filter },
    { $set: { status: 'approved', reviewedAt: new Date() } }
  );
  return result.modifiedCount;
}
