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
    scoreThreshold: number = 0.6, // 60% similarity threshold
    limit: number = 20 // Higher limit to get more potential matches
) => {
    // Use similaritySearchWithScore to get scores along with results
    const resultsWithScores = await vectorStore.similaritySearchWithScore(
        query,
        limit
    );

    // Filter results to only include those with 80% or higher similarity
    const filteredResults = resultsWithScores.filter(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([_result, score]) => score >= scoreThreshold
    );

    // Get the event IDs from the filtered search results
    const eventIds = filteredResults.map(([result]) => result.metadata.eventId);

    // Fetch the full event data from the database
    const events = await Event.find({
        _id: { $in: eventIds },
    });

    // Sort events to match the order of the search results
    const sortedEvents = eventIds
        .map(id =>
            events.find(
                event =>
                    (event._id as mongoose.Types.ObjectId).toString() === id
            )
        )
        .filter(event => event !== undefined) as IEvent[];

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
 * @param scoreThreshold Minimum similarity score threshold (0-1)
 * @param limit Maximum number of results to return
 * @returns Array of matching courses
 */
export const searchSimilarCourses = async (
    vectorStore: MongoDBAtlasVectorSearch,
    query: string,
    scoreThreshold: number = 0.6, // 60% similarity threshold
    limit: number = 20 // Higher limit to get more potential matches
) => {
    // Use similaritySearchWithScore to get scores along with results
    const resultsWithScores = await vectorStore.similaritySearchWithScore(
        query,
        limit
    );

    // Filter results to only include those with 80% or higher similarity
    const filteredResults = resultsWithScores.filter(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([_result, score]) => score >= scoreThreshold
    );

    // Extract course metadata from filtered results
    return filteredResults.map(([result]) => {
        const metadata = { ...result.metadata };
        return metadata as IBaseCourse;
    });
};
