import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
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
    getWebhookSecret,
} from '@/lib/utils/env';
import mongoose from 'mongoose';
import { disconnectFromDatabase } from '@/lib/db/connection';

// Limits that bound the cost of a single call (each event triggers an embedding request)
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

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
        (event as EventInput).description.trim() !== '' &&
        (event as EventInput).title.length <= MAX_TITLE_LENGTH &&
        (event as EventInput).description.length <= MAX_DESCRIPTION_LENGTH
    );
}

/**
 * Read the request body while counting bytes, stopping as soon as the limit is
 * exceeded (Content-Length may be absent or wrong, e.g. chunked transfers).
 * @returns the body text, or null if it exceeds the limit
 */
async function readBodyWithLimit(
    request: NextRequest,
    maxBytes: number
): Promise<string | null> {
    if (!request.body) return '';

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        received += value.byteLength;
        if (received > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }

    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Check the "Authorization: Bearer <secret>" header against WEBHOOK_SECRET.
 * Uses a constant-time comparison to avoid leaking the secret through timing.
 */
function isAuthorized(request: NextRequest, secret: string): boolean {
    const header = request.headers.get('authorization') ?? '';
    const match = header.match(/^Bearer (.+)$/);
    if (!match) return false;

    const provided = Buffer.from(match[1]);
    const expected = Buffer.from(secret);
    return (
        provided.length === expected.length && timingSafeEqual(provided, expected)
    );
}

/**
 * POST handler for webhook endpoint
 * Receives a list of events, validates them, saves to DB, and generates embeddings
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate before doing any work (no DB or OpenAI calls for unauthorized callers).
        // If the secret is not configured, fail closed rather than accept anonymous calls.
        let webhookSecret: string;
        try {
            webhookSecret = getWebhookSecret();
        } catch {
            console.error('Webhook rejected: WEBHOOK_SECRET is not configured');
            return NextResponse.json(
                { error: 'Webhook is not configured' },
                { status: 500 }
            );
        }
        if (!isAuthorized(request, webhookSecret)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Reject oversized payloads before parsing them
        const contentLength = Number(request.headers.get('content-length') ?? 0);
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json(
                { error: `Request body must not exceed ${MAX_BODY_BYTES} bytes` },
                { status: 413 }
            );
        }

        // Get environment variables
        const mongodbUri = getMongoDBConnectionString();
        const openaiApiKey = getOpenAIApiKey();
        const vectorSearchIndexName = getVectorSearchIndexName();

        // Parse request body (bounded read, since content-length can be absent or wrong)
        const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
        if (rawBody === null) {
            return NextResponse.json(
                { error: `Request body must not exceed ${MAX_BODY_BYTES} bytes` },
                { status: 413 }
            );
        }

        let body: unknown;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json(
                { error: 'Request body must be valid JSON' },
                { status: 400 }
            );
        }

        // Validate that body is an array
        if (!Array.isArray(body)) {
            return NextResponse.json(
                { error: 'Request body must be an array of events' },
                { status: 400 }
            );
        }

        if (body.length > MAX_EVENTS_PER_REQUEST) {
            return NextResponse.json(
                { error: `A request may contain at most ${MAX_EVENTS_PER_REQUEST} events` },
                { status: 413 }
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
                        `Each event must have a non-empty title (max ${MAX_TITLE_LENGTH} chars) and description (max ${MAX_DESCRIPTION_LENGTH} chars)`,
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

        // Connect to MongoDB only once the payload is known to be valid
        await connectToDatabase(mongodbUri);

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
        await disconnectFromDatabase();
    }
}
