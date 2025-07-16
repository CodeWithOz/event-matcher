import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Event } from '@/lib/models/Event';
import {
    getMongoDBConnectionString,
    getOpenAIApiKey,
    getVectorSearchIndexName,
} from '@/lib/utils/env';
import {
    initializeEmbeddings,
    initializeVectorStore,
    createEventEmbeddings,
} from '@/lib/utils/embeddings';
import mongoose from 'mongoose';

// POST /api/events/embeddings - Generate embeddings for all events
export async function POST() {
    try {
        // Connect to MongoDB
        await connectToDatabase(getMongoDBConnectionString());

        // Get all events
        const events = await Event.find({});

        if (events.length === 0) {
            return NextResponse.json(
                { message: 'No events found to generate embeddings' },
                { status: 404 }
            );
        }

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

        // Create embeddings for all events
        await createEventEmbeddings(vectorStore, events);

        return NextResponse.json(
            { message: `Embeddings generated for ${events.length} events` },
            { status: 200 }
        );
    } catch (error: unknown) {
        console.error('Error generating embeddings:', error);
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 500 }
        );
    }
}
