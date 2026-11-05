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

/**
 * Get the shared secret expected from callers of the events webhook
 */
export const getWebhookSecret = (): string => {
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    throw new Error('WEBHOOK_SECRET environment variable is not set');
  }

  return secret;
};

/**
 * Get the secret Vercel Cron sends as "Authorization: Bearer <CRON_SECRET>"
 */
export const getCronSecret = (): string => {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    throw new Error('CRON_SECRET environment variable is not set');
  }

  return secret;
};

/**
 * Most short courses imported per daily sync run (default 3)
 */
export const getCourseSyncMaxImports = (): number => {
  const value = Number.parseInt(process.env.COURSE_SYNC_MAX_IMPORTS ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : 3;
};
