import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../lib/db/connection';
import { assertSafeToWipe } from '../lib/utils/local-guard';

// Must match the embedding model in src/lib/utils/embeddings.ts (text-embedding-3-large)
const EMBEDDING_DIMENSIONS = 3072;

/**
 * Creates the collections and vector search indexes in the local database,
 * mirroring the Atlas setup described in the README.
 */
async function initLocalDb() {
    try {
        const mongodbUri = process.env.MONGODB_URI;
        if (!mongodbUri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }
        assertSafeToWipe(mongodbUri, 'init-local-db');

        await connectToDatabase(mongodbUri);

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        const targets = [
            {
                collection: 'event_embeddings',
                index: process.env.EVENT_VECTOR_SEARCH_INDEX_NAME || 'event_vector_index',
            },
            {
                collection: 'courses',
                index: process.env.COURSE_VECTOR_SEARCH_INDEX_NAME || 'course_vector_index',
            },
        ];

        const existing = new Set(
            (await db.listCollections().toArray()).map((c) => c.name)
        );

        for (const { collection, index } of targets) {
            if (!existing.has(collection)) {
                await db.createCollection(collection);
                console.log(`Created collection "${collection}"`);
            }

            const col = db.collection(collection);
            const indexes = await col.listSearchIndexes().toArray();
            if (indexes.some((i) => i.name === index)) {
                console.log(`Index "${index}" already exists on "${collection}"`);
                continue;
            }

            await col.createSearchIndex({
                name: index,
                type: 'vectorSearch',
                definition: {
                    fields: [
                        {
                            type: 'vector',
                            path: 'embedding',
                            numDimensions: EMBEDDING_DIMENSIONS,
                            similarity: 'cosine',
                        },
                    ],
                },
            });
            console.log(`Created vector index "${index}" on "${collection}"`);
        }

        console.log('Local database initialized (indexes may take a few seconds to become queryable)');
    } catch (error) {
        console.error('Error initializing local database:', error);
        process.exitCode = 1;
    } finally {
        await disconnectFromDatabase();
        process.exit();
    }
}

initLocalDb();
