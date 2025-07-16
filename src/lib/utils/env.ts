// Environment variable utility functions

/**
 * Get MongoDB connection string from environment variables
 */
export const getMongoDBConnectionString = (): string => {
  const connectionString = process.env.MONGODB_URI;
  
  if (!connectionString) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  
  return connectionString;
};

/**
 * Get OpenAI API key from environment variables
 */
export const getOpenAIApiKey = (): string => {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  
  return apiKey;
};

/**
 * Get MongoDB Atlas vector search index name for events from environment variables
 * or use default value
 */
export const getVectorSearchIndexName = (): string => {
  return process.env.EVENT_VECTOR_SEARCH_INDEX_NAME || 'event_vector_index';
};
