import { OpenAIEmbeddings } from '@langchain/openai';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Document as LangChainDocument } from '@langchain/core/documents';
import { Event, IEvent } from '../models/Event';
import mongoose from 'mongoose';
import { IBaseCourse } from '../models/Course';

const defaultTextKey = 'content';
const defaultEmbeddingKey = 'embedding';

// Initialize OpenAI embeddings with the specified model
export const initializeEmbeddings = (apiKey: string) => {
    return new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        model: 'text-embedding-3-large',
    });
};

// Initialize MongoDB Atlas Vector Search
export const initializeVectorStore = async (
    collection: mongoose.Collection,
    embeddings: OpenAIEmbeddings,
    indexName: string
) => {
    return new MongoDBAtlasVectorSearch(embeddings, {
        indexName: indexName,
        textKey: defaultTextKey,
        embeddingKey: defaultEmbeddingKey,
        collection: collection,
    });
};

// Create embeddings for events and store them in the database
export const createEventEmbeddings = async (
    vectorStore: MongoDBAtlasVectorSearch,
    events: IEvent[]
) => {
    const documents = events.map(event => {
        return new LangChainDocument({
            pageContent: `${event.title} ${event.description}`,
            metadata: {
                eventId: (event._id as mongoose.Types.ObjectId).toString(),
            },
        });
    });

    await vectorStore.addDocuments(documents);
    return documents;
};

// Search for similar events based on a query
export const searchSimilarEvents = async (
    vectorStore: MongoDBAtlasVectorSearch,
    query: string,
    limit: number = 3
) => {
    const results = await vectorStore.similaritySearch(query, limit);

    // Get the event IDs from the search results
    const eventIds = results.map(result => result.metadata.eventId);

    // Fetch the complete event documents from the database
    const events = await Event.find({ _id: { $in: eventIds } });

    // Sort the events to match the order of the search results
    const sortedEvents = eventIds.map(id =>
        events.find(
            event => (event._id as mongoose.Types.ObjectId).toString() === id
        )
    );

    return sortedEvents;
};

/**
 * Generate structured text for course embeddings
 * Creates a formatted multiline string with course properties in sections
 * @param course The course data
 * @returns Formatted string for embedding
 */
export const generateCourseEmbeddingText = (course: IBaseCourse): string => {
    // Format learning goals as bullet points
    const formattedLearningGoals = course.learningGoals
        .map(goal => `• ${goal}`)
        .join('\n');

    // Format course items as bullet points (titles only)
    const formattedCourseItems = course.courseItems
        .map(item => `• ${item.title}`)
        .join('\n');

    // Format uses code examples as YES/NO
    const usesCodeExamples = course.usesCodeExamples ? 'YES' : 'NO';

    // Create structured text with sections
    return `
TITLE
${course.title}

DESCRIPTION
${course.description}

DIFFICULTY
${course.difficulty}

STUDENT PROFILE
${course.studentProfile}

LEARNING GOALS
${formattedLearningGoals}

COURSE ITEMS
${formattedCourseItems}

USES CODE EXAMPLES
${usesCodeExamples}
`.trim();
};

/**
 * Create course documents with embeddings and add them directly to the vector store
 * This bypasses Mongoose and directly inserts documents with compressed embeddings
 * @param vectorStore MongoDBAtlasVectorSearch instance
 * @param courses Array of course data
 * @param embeddings OpenAIEmbeddings instance
 * @returns The added documents
 */
export const createCourseEmbeddings = async (
    vectorStore: MongoDBAtlasVectorSearch,
    courses: IBaseCourse[]
) => {
    // Create LangChain documents from courses
    const documents = courses.map(course => {
        // Create a document with structured course text for better embedding
        return new LangChainDocument({
            pageContent: generateCourseEmbeddingText(course),
            metadata: course, // Include the full course data as metadata
        });
    });

    await vectorStore.addDocuments(documents);

    return documents;
};

/**
 * Search for similar courses based on a query
 * @param vectorStore MongoDBAtlasVectorSearch instance
 * @param query Search query
 * @param limit Maximum number of results to return
 * @returns Array of matching courses
 */
export const searchSimilarCourses = async (
    vectorStore: MongoDBAtlasVectorSearch,
    query: string,
    limit: number = 3
) => {
    const results = await vectorStore.similaritySearch(query, limit);

    return results.map(result => {
        const metadata = { ...result.metadata };
        return metadata as IBaseCourse;
    });
};
