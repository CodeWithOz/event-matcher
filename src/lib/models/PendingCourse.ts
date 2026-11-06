import mongoose, { Schema, Document } from 'mongoose';
import type { CourseImportResult } from '@/lib/course-import/types';

/**
 * A short course detected on DeepLearning.AI and imported automatically,
 * waiting for an admin to review it before it is published.
 *
 * - pending:  imported, waiting for review
 * - failed:   the import failed; the daily sync retries it (up to MAX_IMPORT_ATTEMPTS)
 * - approved: published as a course
 * - rejected: ignored by the admin; never imported again
 */
export type PendingCourseStatus = 'pending' | 'failed' | 'approved' | 'rejected';

export const MAX_IMPORT_ATTEMPTS = 3;

export interface IPendingCourse extends Document {
  slug: string;
  /** Normalized catalog and imported titles, for duplicate checks (see lib/courses/identity). */
  normalizedTitles: string[];
  url: string;
  catalogTitle: string | null;
  releasedAt: Date | null;
  status: PendingCourseStatus;
  importResult: CourseImportResult | null;
  error: string | null;
  attempts: number;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PendingCourseSchema = new Schema<IPendingCourse>(
  {
    slug: { type: String, required: true, unique: true },
    normalizedTitles: { type: [String], default: [], index: true },
    url: { type: String, required: true },
    catalogTitle: { type: String, default: null },
    releasedAt: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'failed', 'approved', 'rejected'],
      index: true,
    },
    importResult: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'pending_courses' }
);

export const PendingCourse: mongoose.Model<IPendingCourse> =
  mongoose.models.PendingCourse ||
  mongoose.model<IPendingCourse>('PendingCourse', PendingCourseSchema);
