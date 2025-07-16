import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

/**
 * Check environment variables and provide guidance
 */
function checkEnvVariables() {
  console.log('Checking environment variables...\n');
  
  // Check MongoDB URI
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri) {
    console.error('❌ MONGODB_URI is not set');
    console.log('  It should look like: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>');
  } else {
    if (mongodbUri.startsWith('MONGODB_URI=')) {
      console.error('❌ MONGODB_URI has incorrect format. Remove "MONGODB_URI=" prefix');
    } else if (!mongodbUri.startsWith('mongodb')) {
      console.error('❌ MONGODB_URI has incorrect format. Should start with "mongodb://" or "mongodb+srv://"');
    } else {
      console.log('✅ MONGODB_URI is set correctly');
    }
  }
  
  // Check OpenAI API Key
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error('❌ OPENAI_API_KEY is not set');
    console.log('  You can get your API key at https://platform.openai.com/account/api-keys');
  } else {
    if (openaiApiKey.startsWith('OPENAI_API_KEY=')) {
      console.error('❌ OPENAI_API_KEY has incorrect format. Remove "OPENAI_API_KEY=" prefix');
    } else if (openaiApiKey.startsWith('OPENAI_A')) {
      console.error('❌ OPENAI_API_KEY appears to be a placeholder. Replace with your actual API key');
    } else if (!openaiApiKey.startsWith('sk-')) {
      console.error('❌ OPENAI_API_KEY has incorrect format. Should start with "sk-"');
    } else {
      console.log('✅ OPENAI_API_KEY is set correctly');
    }
  }
  
  // Check Event Vector Search Index Name
  const eventVectorSearchIndexName = process.env.EVENT_VECTOR_SEARCH_INDEX_NAME;
  if (!eventVectorSearchIndexName) {
    console.log('ℹ️ EVENT_VECTOR_SEARCH_INDEX_NAME is not set, will use default "event_vector_index"');
  } else {
    if (eventVectorSearchIndexName.startsWith('EVENT_VECTOR_SEARCH_INDEX_NAME=')) {
      console.error('❌ EVENT_VECTOR_SEARCH_INDEX_NAME has incorrect format. Remove "EVENT_VECTOR_SEARCH_INDEX_NAME=" prefix');
    } else {
      console.log('✅ EVENT_VECTOR_SEARCH_INDEX_NAME is set correctly');
    }
  }
  
  // Check Course Vector Search Index Name
  const courseVectorSearchIndexName = process.env.COURSE_VECTOR_SEARCH_INDEX_NAME;
  if (!courseVectorSearchIndexName) {
    console.log('ℹ️ COURSE_VECTOR_SEARCH_INDEX_NAME is not set, will use default "course_vector_index"');
  } else {
    if (courseVectorSearchIndexName.startsWith('COURSE_VECTOR_SEARCH_INDEX_NAME=')) {
      console.error('❌ COURSE_VECTOR_SEARCH_INDEX_NAME has incorrect format. Remove "COURSE_VECTOR_SEARCH_INDEX_NAME=" prefix');
    } else {
      console.log('✅ COURSE_VECTOR_SEARCH_INDEX_NAME is set correctly');
    }
  }
  
  console.log('\nEnvironment variables check completed.');
  console.log('\nMake sure your .env.local file has the following format:');
  console.log('MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>');
  console.log('OPENAI_API_KEY=sk-your_openai_api_key_here');
  console.log('VECTOR_SEARCH_INDEX_NAME=event_vector_index');
}

// Run the check function
checkEnvVariables();
