import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString, getOpenAIApiKey } from '@/lib/utils/env';
import { initializeEmbeddings, initializeVectorStore, createCourseEmbeddings } from '@/lib/utils/embeddings';
import { CourseInputSchema } from '@/lib/validation/course';
import type { IBaseCourse } from '@/lib/models/Course';

type CourseVectorDoc = { _id: mongoose.Types.ObjectId | { toString(): string }; } & IBaseCourse;

// POST /api/admin/courses - Create a new course and generate embeddings
export async function POST(request: NextRequest) {
  try {
    const json = await request.json();

    const parse = CourseInputSchema.safeParse(json);
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parse.error.flatten() }, { status: 400 });
    }

    const data = parse.data;

    // Connect to MongoDB
    await connectToDatabase(getMongoDBConnectionString());

    // Initialize embeddings
    const embeddings = initializeEmbeddings(getOpenAIApiKey());

    // Get target collection for courses (vector store)
    const collection = mongoose.connection.collection('courses');

    // Initialize vector store
    const vectorStore = await initializeVectorStore(
      collection,
      embeddings,
      process.env.COURSE_VECTOR_SEARCH_INDEX_NAME || 'course_vector_index'
    );

    // Add document with embeddings
    await createCourseEmbeddings(vectorStore, [data]);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating course:', error);
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  } finally {
    await disconnectFromDatabase();
  }
}

// GET /api/admin/courses - List courses (from vector store documents' metadata)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = parseInt(searchParams.get('skip') || '0');

    // Connect to MongoDB
    await connectToDatabase(getMongoDBConnectionString());

    const collection = mongoose.connection.collection('courses');
    // Exclude large fields like embedding/content; only return metadata
    const docs = (await collection
      .find({}, { projection: { embedding: 0, content: 0 } })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit + 1) // Get one extra to check if there are more
      .toArray()) as unknown as CourseVectorDoc[];

    const hasMore = docs.length > limit;
    const courses = docs.slice(0, limit).map((d) => ({ id: d._id.toString(), ...d }));

    return NextResponse.json({
      courses,
      hasMore,
      nextSkip: hasMore ? skip + limit : null
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error listing courses:', error);
    return NextResponse.json({ error: 'Failed to list courses' }, { status: 500 });
  } finally {
    await disconnectFromDatabase();
  }
}
