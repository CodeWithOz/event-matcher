import mongoose from 'mongoose';
import { getOpenAIApiKey } from '@/lib/utils/env';
import { initializeEmbeddings, initializeVectorStore, createCourseEmbeddings } from '@/lib/utils/embeddings';
import type { CourseInput } from '@/lib/validation/course';

/**
 * Insert a course with its embedding into the courses vector store.
 * The caller must already be connected to MongoDB.
 */
export async function publishCourse(data: CourseInput): Promise<void> {
  const embeddings = initializeEmbeddings(getOpenAIApiKey());
  const vectorStore = await initializeVectorStore(
    mongoose.connection.collection('courses'),
    embeddings,
    process.env.COURSE_VECTOR_SEARCH_INDEX_NAME || 'course_vector_index'
  );
  await createCourseEmbeddings(vectorStore, [data]);
}
