import { z } from 'zod';

export const InstructorSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
});

export const CourseItemSchema = z.object({
  duration: z.number().int().nonnegative(),
  title: z.string().min(1),
  usesCodeExample: z.boolean().default(false),
});

export const CourseInputSchema = z.object({
  duration: z.number().int().nonnegative(),
  description: z.string().min(1),
  title: z.string().min(1),
  studentProfile: z.string().min(1),
  learningGoals: z.array(z.string().min(1)).min(1),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  instructors: z.array(InstructorSchema).min(1),
  courseItems: z.array(CourseItemSchema).min(1),
  usesCodeExamples: z.boolean().default(false),
  url: z.string().url(),
});

export type CourseInput = z.infer<typeof CourseInputSchema>;
