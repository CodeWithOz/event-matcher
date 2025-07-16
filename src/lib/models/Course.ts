import mongoose, { Schema, Document } from 'mongoose';

// Interfaces for nested objects
export interface IInstructor {
  name: string;
  title: string;
}

export interface ICourseItem {
  duration: number;
  title: string;
  usesCodeExample: boolean;
}

// Base interface for course data (used for metadata typing)
export interface IBaseCourse {
  duration: number;
  description: string;
  title: string;
  studentProfile: string;
  learningGoals: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  instructors: IInstructor[];
  courseItems: ICourseItem[];
  usesCodeExamples: boolean;
  url: string;
}

// Interface for Course document (extends base interface with Mongoose document fields)
export interface ICourse extends IBaseCourse, Document {
  embedding?: Buffer; // Binary data for vector embeddings
  createdAt: Date;
  updatedAt: Date;
}

// Define nested schemas
const InstructorSchema = new Schema({
  name: { type: String, required: true },
  title: { type: String, required: true }
});

const CourseItemSchema = new Schema({
  duration: { type: Number, required: true },
  title: { type: String, required: true },
  usesCodeExample: { type: Boolean, default: false }
});

// Main Course schema
const CourseSchema: Schema = new Schema(
  {
    duration: { type: Number, required: true },
    description: { type: String, required: true },
    title: { type: String, required: true, index: true },
    studentProfile: { type: String, required: true },
    learningGoals: [{ type: String, required: true }],
    difficulty: { 
      type: String, 
      required: true,
      enum: ['Beginner', 'Intermediate', 'Advanced']
    },
    instructors: [InstructorSchema],
    courseItems: [CourseItemSchema],
    usesCodeExamples: { type: Boolean, default: false },
    url: { type: String, required: true },
    embedding: { type: Buffer } // Binary data for vector embeddings
  }, 
  { 
    timestamps: true,
    versionKey: false // Disable Mongoose versioning as we'll handle document insertion manually
  }
);

// Create text indexes for search functionality
CourseSchema.index({ title: 'text', description: 'text' });

// Create and export the Course model
// Check if model exists to prevent "Cannot overwrite model once compiled" error with hot reloading
export const Course: mongoose.Model<ICourse> = mongoose.models.Course || 
  mongoose.model<ICourse>('Course', CourseSchema);
