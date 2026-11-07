'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminHeader from '@/components/admin/AdminHeader';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import type { PendingCourseStatus } from '@/lib/models/PendingCourse';

type PendingCourseSummary = {
  id: string;
  slug: string;
  url: string;
  catalogTitle: string | null;
  releasedAt: string | null;
  status: PendingCourseStatus;
  error: string | null;
  attempts: number;
  createdAt: string;
};

// Release dates are stored as UTC midnight: format them in UTC, or they show the
// previous day in time zones behind UTC
const formatDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

export default function PendingCoursesPage() {
  const [items, setItems] = useState<PendingCourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Course whose "Ignore" confirmation modal is open
  const [toIgnore, setToIgnore] = useState<PendingCourseSummary | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/courses/pending');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load pending courses');
      setItems(data.pendingCourses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Throws on failure: the confirmation modal shows the error and stays open
  const ignore = async (item: PendingCourseSummary) => {
    const res = await fetch(`/api/admin/courses/pending/${item.id}/reject`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to ignore course');
    setItems((prev) => prev.filter((p) => p.id !== item.id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold">Pending Courses</h1>
          <Button variant="outline" asChild>
            <Link href="/admin/courses">← Back to Courses</Link>
          </Button>
        </div>
        <p className="mb-6 text-sm text-gray-600">
          New DeepLearning.AI short courses found by the daily sync. Review each one before it is published.
        </p>

        {error && (
          <div className="mb-6 p-4 border border-red-200 rounded-md bg-red-50 text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-600 border rounded-md bg-white">
            No courses waiting for review.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 p-4 border rounded-md bg-white md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.catalogTitle ?? item.slug}</span>
                    {item.status === 'failed' && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                        Import failed
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    Released {formatDate(item.releasedAt)} ·{' '}
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">
                      Source page
                    </a>
                  </div>
                  {item.status === 'failed' && item.error && (
                    <div className="mt-1 text-sm text-red-700 break-words">
                      {item.error} (attempt {item.attempts})
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button asChild>
                    <Link href={`/admin/courses/pending/${item.id}`}>Review</Link>
                  </Button>
                  <Button variant="outline" onClick={() => setToIgnore(item)}>
                    Ignore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <ConfirmDialog
        open={toIgnore !== null}
        onOpenChange={(open) => !open && setToIgnore(null)}
        title="Ignore this course?"
        description={
          <>
            <span className="font-medium text-foreground">{toIgnore?.catalogTitle ?? toIgnore?.slug}</span> will
            leave the queue and the daily sync will not import it again. You can still add it by hand later.
          </>
        }
        confirmLabel="Ignore"
        pendingLabel="Ignoring…"
        onConfirm={() => (toIgnore ? ignore(toIgnore) : Promise.resolve())}
      />
    </div>
  );
}
