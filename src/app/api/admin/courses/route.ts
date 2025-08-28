import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '@/lib/db/connection';
import { getMongoDBConnectionString, getOpenAIApiKey } from '@/lib/utils/env';
import { initializeEmbeddings, initializeVectorStore, createCourseEmbeddings } from '@/lib/utils/embeddings';
import { CourseInputSchema } from '@/lib/validation/course';

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
