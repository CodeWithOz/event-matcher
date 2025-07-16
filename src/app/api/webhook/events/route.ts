import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Event } from '@/lib/models/Event';
import {
    initializeEmbeddings,
    initializeVectorStore,
    createEventEmbeddings,
} from '@/lib/utils/embeddings';
import {
    getMongoDBConnectionString,
    getOpenAIApiKey,
    getVectorSearchIndexName,
} from '@/lib/utils/env';
import mongoose from 'mongoose';

// Define the expected event structure
interface EventInput {
    title: string;
    description: string;
}

/**
 * Validate an event object
 * @param event The event object to validate
 * @returns True if valid, false otherwise
 */
function isValidEvent(event: unknown): event is EventInput {
    return (
        typeof event === 'object' &&
        event !== null &&
        typeof (event as EventInput).title === 'string' &&
        (event as EventInput).title.trim() !== '' &&
        typeof (event as EventInput).description === 'string' &&
        (event as EventInput).description.trim() !== ''
    );
}

/**
 * POST handler for webhook endpoint
 * Receives a list of events, validates them, saves to DB, and generates embeddings
 */
export async function POST(request: NextRequest) {
    try {
        // Get environment variables
        const mongodbUri = getMongoDBConnectionString();
        const openaiApiKey = getOpenAIApiKey();
        const vectorSearchIndexName = getVectorSearchIndexName();

        // Connect to MongoDB
        await connectToDatabase(mongodbUri);

        // Parse request body
        const body = await request.json();

        // Validate that body is an array
        if (!Array.isArray(body)) {
            return NextResponse.json(
                { error: 'Request body must be an array of events' },
                { status: 400 }
            );
        }

        // Validate each event in the array
        const validEvents: EventInput[] = [];
        const invalidEvents: { event: unknown; index: number }[] = [];

        body.forEach((event, index) => {
            if (isValidEvent(event)) {
                validEvents.push(event);
            } else {
                invalidEvents.push({ event, index });
            }
        });

        // If there are invalid events, return error
        if (invalidEvents.length > 0) {
            return NextResponse.json(
                {
                    error: 'Some events are invalid',
                    invalidEvents,
                    message:
                        'Each event must have a non-empty title and description',
                },
                { status: 400 }
            );
        }

        // If no valid events, return error
        if (validEvents.length === 0) {
            return NextResponse.json(
                { error: 'No valid events provided' },
                { status: 400 }
            );
        }

        // Save valid events to database
        const createdEvents = await Event.insertMany(validEvents);

        // Initialize OpenAI embeddings
        const embeddings = initializeEmbeddings(openaiApiKey);

        // Get the MongoDB collection for vector search
        const collection = mongoose.connection.collection('event_embeddings');

        // Initialize vector store
        const vectorStore = await initializeVectorStore(
            collection,
            embeddings,
            vectorSearchIndexName
        );

        // Create embeddings for all events
        await createEventEmbeddings(vectorStore, createdEvents);

        // Return success response
        return NextResponse.json({
            success: true,
            message: `Successfully processed ${validEvents.length} events`,
            eventsCreated: createdEvents.length,
            eventIds: createdEvents.map(event => event._id),
        });
    } catch (error) {
        console.error('Error processing webhook:', error);

        // Return error response
        return NextResponse.json(
            {
                error: 'Failed to process events',
                message:
                    error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    } finally {
        // Disconnect from MongoDB
        try {
            await mongoose.disconnect();
        } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
        }
    }
}
