'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import CourseForm from '@/components/admin/CourseForm';
import { Button } from '@/components/ui/button';
import type { CourseImportResult } from '@/lib/course-import/types';

type PendingCourseDetail = {
  id: string;
  url: string;
  status: string;
  importResult: CourseImportResult | null;
};

export default function ReviewPendingCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pending, setPending] = useState<PendingCourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/courses/pending/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load pending course');
        const doc = data.pendingCourse as PendingCourseDetail;
        if (doc.status !== 'pending' && doc.status !== 'failed') {
          throw new Error('This course was already reviewed');
        }
        if (!cancelled) setPending(doc);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load pending course');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (pending) {
    return (
      <CourseForm
        pendingCourseId={id}
        initialImport={pending.importResult}
        initialImportUrl={pending.url}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {error ? (
          <div className="space-y-4">
            <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700">{error}</div>
            <Button variant="outline" asChild>
              <Link href="/admin/courses/pending">← Back to Pending Courses</Link>
            </Button>
          </div>
        ) : (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        )}
      </main>
    </div>
  );
}
