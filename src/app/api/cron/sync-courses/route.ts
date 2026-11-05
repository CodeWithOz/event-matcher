import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { connectToDatabase } from '@/lib/db/connection';
import { syncShortCourses } from '@/lib/course-sync';
import {
  getCourseSyncMaxImports,
  getCronSecret,
  getMongoDBConnectionString,
} from '@/lib/utils/env';

// Vercel Hobby allows functions to run for at most 300 seconds
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Stop starting new imports after this long, so an import in flight can finish
const IMPORT_BUDGET_MS = 150_000;

function isAuthorized(request: NextRequest, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * GET /api/cron/sync-courses
 * Called once a day by Vercel Cron (see vercel.json), which sends
 * "Authorization: Bearer <CRON_SECRET>". Queues new DeepLearning.AI short
 * courses in pending_courses for admin review; nothing is published here.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  let secret: string;
  try {
    secret = getCronSecret();
  } catch {
    console.error('Course sync rejected: CRON_SECRET is not configured');
    return NextResponse.json({ error: 'Course sync is not configured' }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase(getMongoDBConnectionString());

    const summary = await syncShortCourses({
      maxImports: getCourseSyncMaxImports(),
      deadline: startedAt + IMPORT_BUDGET_MS,
    });

    console.info('[course-sync] Done', { ...summary, durationMs: Date.now() - startedAt });
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[course-sync] Failed', message);
    return NextResponse.json({ error: 'Course sync failed', details: message }, { status: 502 });
  }
}
