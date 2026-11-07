import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { connectToDatabase, disconnectFromDatabase } from '../lib/db/connection';
import { ensureCourseIdentity } from '../lib/courses/ensure-identity';

/**
 * Optional: fills or fixes the course identity fields and creates their indexes right
 * away. The app does the same by itself on its first duplicate check (see
 * lib/courses/ensure-identity), so running this is never required.
 * Safe to run several times, and against production (it deletes nothing).
 */
async function main() {
  try {
    const mongodbUri = process.env.MONGODB_URI;
    if (!mongodbUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    await connectToDatabase(mongodbUri);

    const { courses, pendingCourses } = await ensureCourseIdentity();
    console.log(`Identity fields updated: ${courses} course(s), ${pendingCourses} pending course(s); indexes ready`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectFromDatabase();
  }
}

main();
