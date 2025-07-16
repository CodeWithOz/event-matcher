import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { connectToDatabase } from '../lib/db/connection';
import { Course, IBaseCourse } from '../lib/models/Course';
import {
    initializeEmbeddings,
    initializeVectorStore,
    createCourseEmbeddings,
} from '../lib/utils/embeddings';
import mongoose from 'mongoose';
import { disconnectFromDatabase } from '../lib/db/connection';
import fs from 'fs';
import path from 'path';

/**
 * Main function to seed courses and generate embeddings
 */
async function seedCourses() {
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

        // Read courses from JSON file
        const coursesFilePath = path.join(process.cwd(), 'courses.json');
        const coursesData = JSON.parse(
            fs.readFileSync(coursesFilePath, 'utf8')
        );

        if (!Array.isArray(coursesData)) {
            throw new Error('Courses data is not an array');
        }

        console.log(`Found ${coursesData.length} courses in JSON file`);

        // Clear existing courses
        await Course.deleteMany({});
        console.log('Cleared existing courses');

        // Initialize OpenAI embeddings
        const embeddings = initializeEmbeddings(openaiApiKey);

        // Get the MongoDB collection for vector search
        const collection = mongoose.connection.collection('courses');

        // Clear existing course documents in the collection
        await collection.deleteMany({});
        console.log('Cleared existing course documents');

        // Initialize vector store
        const vectorStore = await initializeVectorStore(
            collection,
            embeddings,
            process.env.COURSE_VECTOR_SEARCH_INDEX_NAME || 'course_vector_index'
        );

        // Convert JSON data to IBaseCourse objects
        const courses: IBaseCourse[] = coursesData.map(course => ({
            title: course.title,
            description: course.description,
            duration: course.duration,
            studentProfile: course.studentProfile,
            learningGoals: course.learningGoals,
            difficulty: course.difficulty,
            instructors: course.instructors,
            courseItems: course.courseItems,
            usesCodeExamples: course.usesCodeExamples,
            url: course.url,
        }));

        // Create embeddings and store courses
        await createCourseEmbeddings(vectorStore, courses);
        console.log(`Generated embeddings for ${courses.length} courses`);

        console.log('Database seeding completed successfully');
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        // Disconnect from MongoDB
        await disconnectFromDatabase();
        process.exit(0);
    }
}

// Run the seed function
seedCourses();
