import mongoose from 'mongoose';
import type { AnyBulkWriteOperation, Document } from 'mongodb';
import { courseIdentity, normalizeTitle } from './identity';

/**
 * MongoDB has no schema migrations, so documents written before the identity
 * fields existed (see ./identity) are brought up to date by the code itself:
 * the first duplicate check of each server process fills the missing fields
 * and creates the indexes. Every step is idempotent, so there is nothing to
 * run before a deploy and nothing breaks if a document is written by older code.
 *
 * No path-alias imports here: the backfill script (ts-node) uses this module too.
 */

const BATCH_SIZE = 500;

async function fillMissing(
  collectionName: string,
  missing: Document,
  projection: Document,
  toSet: (doc: Document) => Document
): Promise<number> {
  const collection = mongoose.connection.collection(collectionName);
  let ops: AnyBulkWriteOperation[] = [];
  let updated = 0;

  const flush = async () => {
    if (ops.length === 0) return;
    const result = await collection.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount;
    ops = [];
  };

  // Only documents lacking the fields are read, with only the fields needed to compute them
  for await (const doc of collection.find(missing, { projection })) {
    // Repeating the "missing" filter skips a document that was saved (with its
    // own identity fields) after it was read here: its values are newer
    ops.push({ updateOne: { filter: { _id: doc._id, ...missing }, update: { $set: toSet(doc) } } });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return updated;
}

async function run(): Promise<{ courses: number; pendingCourses: number }> {
  const db = mongoose.connection;

  // Indexes first: the "missing field" queries below can then use them
  await db.collection('courses').createIndexes([
    { key: { slug: 1 }, name: 'slug_1' },
    { key: { normalizedTitle: 1 }, name: 'normalizedTitle_1' },
  ]);
  await db.collection('pending_courses').createIndexes([
    { key: { normalizedTitles: 1 }, name: 'normalizedTitles_1' },
    // The sync relies on this index: its upserts claim one entry per slug, and
    // a duplicate-key error is how it knows another entry already exists. The
    // model declares it too, but Mongoose builds model indexes in the
    // background (and not at all when autoIndex is off), so it is created here
    // before any sync runs. If duplicate slugs already exist, this fails and
    // the sync stops with that error rather than adding more.
    { key: { slug: 1 }, name: 'slug_1', unique: true },
  ]);

  const courses = await fillMissing(
    'courses',
    { $or: [{ slug: { $exists: false } }, { normalizedTitle: { $exists: false } }] },
    { url: 1, title: 1 },
    (doc) => courseIdentity(doc)
  );

  const pendingCourses = await fillMissing(
    'pending_courses',
    { normalizedTitles: { $exists: false } },
    { catalogTitle: 1, 'importResult.course.title.value': 1 },
    (doc) => ({
      normalizedTitles: [
        ...new Set(
          [doc.catalogTitle, doc.importResult?.course?.title?.value]
            .filter((t): t is string => typeof t === 'string')
            .map(normalizeTitle)
            .filter(Boolean)
        ),
      ],
    })
  );

  if (courses > 0 || pendingCourses > 0) {
    console.info('[course-identity] Filled missing identity fields', { courses, pendingCourses });
  }
  return { courses, pendingCourses };
}

let ensured: Promise<{ courses: number; pendingCourses: number }> | null = null;

/**
 * Make sure identity fields and their indexes exist. Runs once per process;
 * a failure is retried on the next call. The caller must already be connected.
 */
export function ensureCourseIdentity(): Promise<{ courses: number; pendingCourses: number }> {
  if (!ensured) {
    ensured = run().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}
