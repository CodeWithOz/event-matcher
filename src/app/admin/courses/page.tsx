"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Course, IBaseCourse } from "@/lib/models/Course";

type Course = { id: string } & Partial<IBaseCourse>;

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextSkip, setNextSkip] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadCourses = async (skip: number = 0, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`/api/admin/courses?limit=20&skip=${skip}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load courses");
      }

      if (append) {
        setCourses((prev) => [...prev, ...data.courses]);
      } else {
        setCourses(data.courses);
      }

      setHasMore(data.hasMore);
      setNextSkip(data.nextSkip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (nextSkip !== null) {
      loadCourses(nextSkip, true);
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!confirm("Are you sure you want to delete this course?")) {
      return;
    }

    try {
      setDeleting(courseId);

      const response = await fetch(`/api/admin/courses/${courseId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete course");
      }

      // Remove the deleted course from the list
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Courses</h1>
          <Link href="/admin/courses/new">
            <Button>Add New Course</Button>
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-red-200 rounded-md bg-red-50 text-red-700">
            {error}
          </div>
        )}

        {courses.length === 0 && !loading ? (
          <p className="text-gray-600">No courses found.</p>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <div key={c.id} className="rounded-md border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div
                      className="font-medium truncate"
                      title={c.title || "Untitled"}
                    >
                      {c.title || "Untitled"}
                    </div>
                    <div className="text-sm text-gray-600">
                      {c.difficulty ? `${c.difficulty} • ` : ""}
                      {c.duration !== undefined && c.duration >= 0
                        ? `${c.duration} min`
                        : ""}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteCourse(c.id)}
                      disabled={deleting === c.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deleting === c.id ? "Deleting…" : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={loadMore}
                  disabled={loadingMore}
                  variant="outline"
                >
                  {loadingMore ? "Loading…" : "Load More"}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
