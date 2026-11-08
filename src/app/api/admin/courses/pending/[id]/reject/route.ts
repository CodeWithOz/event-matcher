import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse } from '@/lib/models/PendingCourse';

// POST /api/admin/courses/pending/[id]/reject - Ignore a course; the sync never imports it again
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Pending course not found' }, { status: 404 });
    }

    await connectToDatabase(getMongoDBConnectionString());
    const doc = await PendingCourse.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'rejected', reviewedAt: new Date() } }
    );
    if (!doc) {
      return NextResponse.json({ error: 'This course was already reviewed' }, { status: 409 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error rejecting pending course:', error);
    return NextResponse.json({ error: 'Failed to ignore course' }, { status: 500 });
  }
}
