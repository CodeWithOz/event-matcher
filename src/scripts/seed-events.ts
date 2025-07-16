import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { connectToDatabase } from '../lib/db/connection';
import { Event } from '../lib/models/Event';
import {
    initializeEmbeddings,
    initializeVectorStore,
    createEventEmbeddings,
} from '../lib/utils/embeddings';
import mongoose from 'mongoose';

// Sample events data
const sampleEvents = [
    {
        title: 'Tech Conference 2025',
        description:
            'A three-day conference featuring the latest in AI, blockchain, and cloud computing. Network with industry leaders and attend workshops on cutting-edge technologies.',
    },
    {
        title: 'Startup Pitch Night',
        description:
            'Join us for an evening of innovation as local startups pitch their ideas to investors. Great opportunity for networking and discovering new business opportunities.',
    },
    {
        title: 'Community Hackathon',
        description:
            'A weekend-long hackathon where developers, designers, and entrepreneurs collaborate to build solutions for local community challenges. All skill levels welcome!',
    },
    {
        title: 'Data Science Workshop',
        description:
            'Learn practical data science skills in this hands-on workshop. Topics include data cleaning, visualization, machine learning basics, and how to deploy models.',
    },
    {
        title: 'Art Exhibition Opening',
        description:
            'Celebrate the opening of our new contemporary art exhibition featuring works from local and international artists exploring themes of nature and technology.',
    },
    {
        title: 'Charity Fundraiser Gala',
        description:
            'An elegant evening of dining and entertainment to raise funds for education initiatives in underserved communities. Includes silent auction and live music.',
    },
    {
        title: 'Outdoor Adventure Retreat',
        description:
            'A weekend retreat focused on outdoor activities like hiking, rock climbing, and camping. Professional guides will lead small groups through beautiful natural landscapes.',
    },
    {
        title: 'Culinary Festival',
        description:
            "Sample dishes from the city's best restaurants and attend cooking demonstrations from renowned chefs. Features international cuisines and local specialties.",
    },
    {
        title: 'Wellness and Mindfulness Day',
        description:
            'A day dedicated to personal wellness with yoga sessions, meditation workshops, nutrition talks, and stress management techniques for busy professionals.',
    },
    {
        title: 'Film Screening and Director Q&A',
        description:
            'Exclusive screening of an award-winning independent film followed by a Q&A session with the director and lead actors. Discussion on filmmaking process and industry insights.',
    },
];

/**
 * Seed the database with sample events and generate embeddings
 */
async function seedEvents() {
    try {
        // Check for environment variables
        const mongodbUri = process.env.MONGODB_URI;
        const openaiApiKey = process.env.OPENAI_API_KEY;

        if (!mongodbUri) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        if (!openaiApiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }

        // Connect to MongoDB
        await connectToDatabase(mongodbUri);
        console.log('Connected to MongoDB Atlas');

        // Clear existing events
        await Event.deleteMany({});
        console.log('Cleared existing events');

        // Insert sample events
        const createdEvents = await Event.insertMany(sampleEvents);
        console.log(`Created ${createdEvents.length} sample events`);

        // Initialize OpenAI embeddings
        const embeddings = initializeEmbeddings(openaiApiKey);

        // Get the MongoDB collection for vector search
        const collection = mongoose.connection.collection('event_embeddings');

        // Clear existing embeddings
        await collection.deleteMany({});
        console.log('Cleared existing embeddings');

        // Initialize vector store
        const vectorStore = await initializeVectorStore(
            collection,
            embeddings,
            process.env.EVENT_VECTOR_SEARCH_INDEX_NAME || 'event_vector_index'
        );

        // Create embeddings for all events
        await createEventEmbeddings(vectorStore, createdEvents);
        console.log(`Generated embeddings for ${createdEvents.length} events`);

        console.log('Database seeding completed successfully');
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB Atlas');
        process.exit(0);
    }
}

// Run the seed function
seedEvents();
