import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString, getOpenAIApiKey } from '@/lib/utils/env';
import { initializeEmbeddings, generateCourseEmbeddingText } from '@/lib/utils/embeddings';
import { CourseInputSchema } from '@/lib/validation/course';

// GET /api/admin/courses/[id] - Fetch a single course's editable fields
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    await connectToDatabase(getMongoDBConnectionString());

    const collection = mongoose.connection.collection('courses');
    const doc = await collection.findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { projection: { embedding: 0, content: 0 } }
    );

    if (!doc) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const { _id, ...course } = doc;
    void _id;
    return NextResponse.json({ course }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching course:', error);
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 });
  }
}

// PUT /api/admin/courses/[id] - Update a course and regenerate its embedding
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const parse = CourseInputSchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parse.error.flatten() }, { status: 400 });
    }
    const data = parse.data;

    await connectToDatabase(getMongoDBConnectionString());

    const content = generateCourseEmbeddingText(data);
    const embedding = await initializeEmbeddings(getOpenAIApiKey()).embedQuery(content);

    const collection = mongoose.connection.collection('courses');
    const result = await collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { ...data, content, embedding } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error updating course:', error);
    return NextResponse.json({ error: 'Failed to update course' }, { status: 500 });
  }
}

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
  }
}
