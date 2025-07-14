import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { connectToDatabase, disconnectFromDatabase } from '../lib/db/connection';
import mongoose from 'mongoose';

/**
 * Test MongoDB Atlas connection and verify collections
 */
async function testConnection() {
  try {
    // Check for environment variables
    const mongodbUri = process.env.MONGODB_URI;
    
    if (!mongodbUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    console.log('Testing MongoDB Atlas connection...');
    
    // Connect to MongoDB
    await connectToDatabase(mongodbUri);
    console.log('✅ Successfully connected to MongoDB Atlas');
    
    // Get database information
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    const collections = await db.listCollections().toArray();
    
    console.log('\nAvailable collections:');
    collections.forEach((collection: { name: string }) => {
      console.log(`- ${collection.name}`);
    });
    
    // Check for required collections
    const hasEventsCollection = collections.some((c: { name: string }) => c.name === 'events');
    const hasEmbeddingsCollection = collections.some((c: { name: string }) => c.name === 'event_embeddings');
    
    console.log('\nRequired collections check:');
    console.log(`- events collection: ${hasEventsCollection ? '✅ Found' : '❌ Not found'}`);
    console.log(`- event_embeddings collection: ${hasEmbeddingsCollection ? '✅ Found' : '❌ Not found'}`);
    
    // Check for vector search index if embeddings collection exists
    if (hasEmbeddingsCollection) {
      try {
        const indexName = process.env.VECTOR_SEARCH_INDEX_NAME || 'event_vector_index';
        if (!db) {
          throw new Error('Database connection not established');
        }
        const indexes = await db.collection('event_embeddings').listIndexes().toArray();
        
        console.log('\nVector search index check:');
        
        // MongoDB Atlas vector search indexes don't show up in regular indexes
        // We'll just inform the user to verify in the Atlas UI
        console.log(`Please verify that the vector search index "${indexName}" exists in your MongoDB Atlas dashboard.`);
        console.log('Regular indexes on event_embeddings collection:');
        
        indexes.forEach((index: { name: string }) => {
          console.log(`- ${index.name}`);
        });
      } catch (error) {
        console.error('Error checking vector search index:', error);
      }
    }
    
    console.log('\nConnection test completed.');
  } catch (error) {
    console.error('Error testing connection:', error);
  } finally {
    // Disconnect from MongoDB
    await disconnectFromDatabase();
    process.exit(0);
  }
}

// Run the test function
testConnection();
