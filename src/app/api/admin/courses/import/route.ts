import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { importCourseFromUrl, CourseImportError } from '@/lib/course-import';

const BodySchema = z.object({
  url: z.string().url(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parseResult = BodySchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { url } = parseResult.data;

    const result = await importCourseFromUrl(url);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof CourseImportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }

    console.error('Course import failed', error);
    return NextResponse.json({ error: 'Unexpected error while importing course' }, { status: 500 });
  }
}
