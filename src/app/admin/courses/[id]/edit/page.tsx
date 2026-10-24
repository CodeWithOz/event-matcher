'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import CourseForm, { DEFAULT_VALUES, type FormValues } from '@/components/admin/CourseForm';
import { Button } from '@/components/ui/button';

export default function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [course, setCourse] = useState<FormValues | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/courses/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load course');
        if (!cancelled) {
          // Stored records may lack fields: fill gaps from the form defaults
          const c = (data.course ?? {}) as Partial<FormValues>;
          setCourse({
            ...DEFAULT_VALUES,
            ...Object.fromEntries(
              Object.keys(DEFAULT_VALUES)
                .filter((k) => c[k as keyof FormValues] != null)
                .map((k) => [k, c[k as keyof FormValues]])
            ),
            learningGoals: c.learningGoals?.length ? c.learningGoals : DEFAULT_VALUES.learningGoals,
            instructors: c.instructors?.length
              ? c.instructors.map((i) => ({ name: i?.name ?? '', title: i?.title ?? '' }))
              : DEFAULT_VALUES.instructors,
            courseItems: c.courseItems?.length
              ? c.courseItems.map((i) => ({
                  title: i?.title ?? '',
                  duration: i?.duration ?? 0,
                  usesCodeExample: i?.usesCodeExample ?? false,
                }))
              : DEFAULT_VALUES.courseItems,
          } as FormValues);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load course');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (course) {
    return <CourseForm courseId={id} initialValues={course} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {error ? (
          <div className="space-y-4">
            <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700">{error}</div>
            <Button variant="outline" asChild>
              <Link href="/admin/courses">← Back to Courses</Link>
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
