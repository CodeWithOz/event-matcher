import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString } from '@/lib/utils/env';

// DELETE /api/admin/courses/[id] - Delete a course by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase(getMongoDBConnectionString());

    const collection = mongoose.connection.collection('courses');
    const { id } = await params;
    const result = await collection.deleteOne({
      _id: new mongoose.Types.ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error deleting course:', error);
    return NextResponse.json({ error: 'Failed to delete course' }, { status: 500 });
  } finally {
    await disconnectFromDatabase();
  }
}
