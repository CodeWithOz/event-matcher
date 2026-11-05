import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse } from '@/lib/models/PendingCourse';
import { CourseInputSchema } from '@/lib/validation/course';
import { publishCourse } from '@/lib/courses/publish';

// POST /api/admin/courses/pending/[id]/approve - Publish the reviewed course values
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: 'Pending course not found' }, { status: 404 });
  }

  const parse = CourseInputSchema.safeParse(await request.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parse.error.flatten() }, { status: 400 });
  }

  let claimed = false;
  try {
    await connectToDatabase(getMongoDBConnectionString());

    // Claim the entry first so a double click cannot publish the course twice
    const doc = await PendingCourse.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'approved', reviewedAt: new Date() } }
    );
    if (!doc) {
      return NextResponse.json({ error: 'This course was already reviewed' }, { status: 409 });
    }
    claimed = true;

    await publishCourse(parse.data);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error approving pending course:', error);
    if (claimed) {
      // Publishing failed: put the entry back in the queue
      await PendingCourse.updateOne({ _id: id }, { $set: { status: 'pending', reviewedAt: null } }).catch(
        (e) => console.error('Failed to restore pending course status:', e)
      );
    }
    return NextResponse.json({ error: 'Failed to publish course' }, { status: 500 });
  }
}
