import { OpenAIEmbeddings } from '@langchain/openai';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Document as LangChainDocument } from '@langchain/core/documents';
import { Event, IEvent } from '../models/Event';
import mongoose from 'mongoose';

// Initialize OpenAI embeddings with the specified model
export const initializeEmbeddings = (apiKey: string) => {
  return new OpenAIEmbeddings({
    openAIApiKey: apiKey,
    model: 'text-embedding-3-large',
  });
};

// Initialize MongoDB Atlas Vector Search
export const initializeVectorStore = async (
  collection: mongoose.Collection<IEvent>,
  embeddings: OpenAIEmbeddings,
  indexName: string
) => {
  return new MongoDBAtlasVectorSearch(embeddings, {
    indexName: indexName,
    textKey: 'content',
    embeddingKey: 'embedding',
    collection: collection as unknown as mongoose.Collection
  });
};

// Create embeddings for events and store them in the database
export const createEventEmbeddings = async (
  vectorStore: MongoDBAtlasVectorSearch,
  events: IEvent[]
) => {
  const documents = events.map((event) => {
    return new LangChainDocument({
      pageContent: `${event.title} ${event.description}`,
      metadata: { eventId: (event._id as mongoose.Types.ObjectId).toString() },
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
  const eventIds = results.map((result) => result.metadata.eventId);
  
  // Fetch the complete event documents from the database
  const events = await Event.find({ _id: { $in: eventIds } });
  
  // Sort the events to match the order of the search results
  const sortedEvents = eventIds.map((id) => 
    events.find((event) => (event._id as mongoose.Types.ObjectId).toString() === id)
  );
  
  return sortedEvents;
};
