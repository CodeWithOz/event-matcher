import mongoose from 'mongoose';
import type { AnyBulkWriteOperation, Document } from 'mongodb';
import { courseIdentity, normalizeTitle } from './identity';

/**
 * MongoDB has no schema migrations, so documents written before the identity
 * fields existed (see ./identity) are brought up to date by the code itself:
 * the first duplicate check of each server process fills the missing fields
 * and creates the indexes. Titles with non-ASCII characters are recomputed too,
 * since an earlier version of normalizeTitle turned accents into spaces; this
 * rewrites nothing once they are correct. Every step is idempotent, so there is nothing to
 * run before a deploy and nothing breaks if a document is written by older code.
 *
 * No path-alias imports here: the backfill script (ts-node) uses this module too.
 */

const BATCH_SIZE = 500;

/** Matches strings containing a non-ASCII character (accents, typographic quotes…). */
const NON_ASCII = /[^\x00-\x7F]/;

async function updateIdentity(
  collectionName: string,
  outdated: Document,
  sourceFields: string[],
  toSet: (doc: Document) => Document
): Promise<number> {
  const collection = mongoose.connection.collection(collectionName);
  const projection = Object.fromEntries(sourceFields.map((field) => [field, 1]));
  let ops: AnyBulkWriteOperation[] = [];
  let updated = 0;

  const flush = async () => {
    if (ops.length === 0) return;
    const result = await collection.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount;
    ops = [];
  };

  // Only documents whose identity may be outdated are read, with only the fields needed to compute it
  for await (const doc of collection.find(outdated, { projection })) {
    // The write only applies if the source fields still hold the values read
    // here: a document saved in the meantime keeps its own, newer identity
    const unchanged = Object.fromEntries(sourceFields.map((field) => [field, valueAt(doc, field) ?? null]));
    ops.push({ updateOne: { filter: { _id: doc._id, ...unchanged }, update: { $set: toSet(doc) } } });
    if (ops.length >= BATCH_SIZE) await flush();
  }
  await flush();
  return updated;
}

/** Value at a dotted path, e.g. "importResult.course.title.value". */
function valueAt(doc: Document, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Document | undefined)?.[key], doc);
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

  const courses = await updateIdentity(
    'courses',
    {
      $or: [
        { slug: { $exists: false } },
        { normalizedTitle: { $exists: false } },
        { title: { $regex: NON_ASCII } },
      ],
    },
    ['url', 'title'],
    (doc) => courseIdentity(doc)
  );

  const pendingCourses = await updateIdentity(
    'pending_courses',
    {
      $or: [
        { normalizedTitles: { $exists: false } },
        { catalogTitle: { $regex: NON_ASCII } },
        { 'importResult.course.title.value': { $regex: NON_ASCII } },
      ],
    },
    ['catalogTitle', 'importResult.course.title.value'],
    (doc) => ({
      normalizedTitles: [
        ...new Set(
          [doc.catalogTitle, valueAt(doc, 'importResult.course.title.value')]
            .filter((t): t is string => typeof t === 'string')
            .map(normalizeTitle)
            .filter(Boolean)
        ),
      ],
    })
  );

  if (courses > 0 || pendingCourses > 0) {
    console.info('[course-identity] Updated course identity fields', { courses, pendingCourses });
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
