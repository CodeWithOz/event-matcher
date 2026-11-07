import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse } from '@/lib/models/PendingCourse';

export const dynamic = 'force-dynamic';

// GET /api/admin/courses/pending - Courses waiting for review, plus failed imports
export async function GET() {
  try {
    await connectToDatabase(getMongoDBConnectionString());

    const docs = await PendingCourse.find(
      { status: { $in: ['pending', 'failed'] } },
      { importResult: 0 }
    )
      .sort({ releasedAt: -1, createdAt: -1 })
      .lean();

    const pendingCourses = docs.map(({ _id, ...doc }) => ({ ...doc, id: String(_id) }));
    return NextResponse.json({ pendingCourses }, { status: 200 });
  } catch (error) {
    console.error('Error listing pending courses:', error);
    return NextResponse.json({ error: 'Failed to list pending courses' }, { status: 500 });
  }
}
