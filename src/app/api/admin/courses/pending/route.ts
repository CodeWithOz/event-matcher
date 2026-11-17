import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse } from '@/lib/models/PendingCourse';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseNonNegativeInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// GET /api/admin/courses/pending?limit=20&skip=0 - Courses waiting for review, plus failed imports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseNonNegativeInt(searchParams.get('limit'), DEFAULT_LIMIT), 1), MAX_LIMIT);
    const skip = parseNonNegativeInt(searchParams.get('skip'), 0);

    await connectToDatabase(getMongoDBConnectionString());

    const filter = { status: { $in: ['pending', 'failed'] } };
    const [docs, total] = await Promise.all([
      PendingCourse.find(filter, { importResult: 0 })
        // _id breaks ties so pages do not overlap or skip items
        .sort({ releasedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit + 1) // One extra to know whether there are more
        .lean(),
      PendingCourse.countDocuments(filter),
    ]);

    const hasMore = docs.length > limit;
    const pendingCourses = docs.slice(0, limit).map(({ _id, ...doc }) => ({ ...doc, id: String(_id) }));
    return NextResponse.json(
      { pendingCourses, total, hasMore, nextSkip: hasMore ? skip + limit : null },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error listing pending courses:', error);
    return NextResponse.json({ error: 'Failed to list pending courses' }, { status: 500 });
  }
}
