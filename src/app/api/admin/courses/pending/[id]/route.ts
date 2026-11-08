import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';
import { PendingCourse } from '@/lib/models/PendingCourse';

// GET /api/admin/courses/pending/[id] - A pending course with its import suggestions
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Pending course not found' }, { status: 404 });
    }

    await connectToDatabase(getMongoDBConnectionString());
    const doc = await PendingCourse.findById(id).lean();
    if (!doc) {
      return NextResponse.json({ error: 'Pending course not found' }, { status: 404 });
    }

    const { _id, ...pendingCourse } = doc;
    return NextResponse.json({ pendingCourse: { ...pendingCourse, id: String(_id) } }, { status: 200 });
  } catch (error) {
    console.error('Error fetching pending course:', error);
    return NextResponse.json({ error: 'Failed to fetch pending course' }, { status: 500 });
  }
}
