import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import {
    getMongoDBConnectionString,
    getOpenAIApiKey,
} from '@/lib/utils/env';
import {
    initializeEmbeddings,
    initializeVectorStore,
    searchSimilarCourses,
} from '@/lib/utils/embeddings';
import mongoose from 'mongoose';

// POST /api/search/courses - Search for courses based on query
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { query } = body;

        if (!query) {
            return NextResponse.json(
                { error: 'Search query is required' },
                { status: 400 }
            );
        }

        // Connect to MongoDB
        await connectToDatabase(getMongoDBConnectionString());

        // Initialize OpenAI embeddings
        const embeddings = initializeEmbeddings(getOpenAIApiKey());

        // Get the MongoDB collection for vector search
        const collection = mongoose.connection.collection('courses');

        // Initialize vector store
        const vectorStore = await initializeVectorStore(
            collection,
            embeddings,
            process.env.COURSE_VECTOR_SEARCH_INDEX_NAME || 'course_vector_index'
        );

        // Search for similar courses
        const matchedCourses = await searchSimilarCourses(vectorStore, query);

        return NextResponse.json({ courses: matchedCourses }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error searching courses:', error);
        return NextResponse.json(
            { error: 'Failed to search courses' },
            { status: 500 }
        );
    } finally {
        // Disconnect from MongoDB
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
        }
    }
}
