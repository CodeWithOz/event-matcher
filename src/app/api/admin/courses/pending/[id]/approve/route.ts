import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse, type PendingCourseStatus } from '@/lib/models/PendingCourse';
import { CourseInputSchema } from '@/lib/validation/course';
import { publishCourse } from '@/lib/courses/publish';
import { isCoursePublished } from '@/lib/courses/duplicates';
import { isDuplicateKeyError } from '@/lib/db/errors';

const alreadyPublished = () =>
  NextResponse.json(
    { error: 'This course is already published. It has been removed from the pending queue.' },
    { status: 409 }
  );

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

  // Status before the claim ('pending' or 'failed'), restored if publishing fails
  let claimedFrom: PendingCourseStatus | null = null;
  try {
    await connectToDatabase(getMongoDBConnectionString());

    // Claim the entry first so a double click cannot publish the course twice.
    // findOneAndUpdate returns the document as it was before the update.
    const doc = await PendingCourse.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'approved', reviewedAt: new Date() } }
    );
    if (!doc) {
      return NextResponse.json({ error: 'This course was already reviewed' }, { status: 409 });
    }
    claimedFrom = doc.status;

    // The course may have been added by hand since it was queued: publishing it
    // again would create a duplicate. The entry stays out of the queue.
    if (await isCoursePublished(parse.data)) {
      claimedFrom = null;
      return alreadyPublished();
    }

    try {
      await publishCourse(parse.data);
    } catch (error) {
      // Published by another request since the check above (unique slug index)
      if (isDuplicateKeyError(error)) {
        claimedFrom = null;
        return alreadyPublished();
      }
      throw error;
    }
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Error approving pending course:', error);
    if (claimedFrom) {
      // Publishing failed: put the entry back as it was (a failed import keeps
      // its error and stays eligible for the sync's retries)
      await PendingCourse.updateOne(
        { _id: id, status: 'approved' },
        { $set: { status: claimedFrom, reviewedAt: null } }
      ).catch(
        (e) => console.error('Failed to restore pending course status:', e)
      );
    }
    return NextResponse.json({ error: 'Failed to publish course' }, { status: 500 });
  }
}
