import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import {
    getMongoDBConnectionString,
    getOpenAIApiKey,
    getVectorSearchIndexName,
} from '@/lib/utils/env';
import {
    initializeEmbeddings,
    initializeVectorStore,
    searchSimilarEvents,
} from '@/lib/utils/embeddings';
import mongoose from 'mongoose';

// POST /api/search - Search for events based on query
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
        const collection = mongoose.connection.collection('event_embeddings');

        // Initialize vector store
        const vectorStore = await initializeVectorStore(
            collection,
            embeddings,
            getVectorSearchIndexName()
        );

        // Search for similar events
        const matchedEvents = await searchSimilarEvents(vectorStore, query);

        return NextResponse.json({ events: matchedEvents }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error searching events:', error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
