import AdminHeader from "@/components/admin/AdminHeader";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import mongoose from "mongoose";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/connection";
import { getMongoDBConnectionString } from "@/lib/utils/env";
import { Course, IBaseCourse } from "@/lib/models/Course";

type Course = { id: string } & Partial<IBaseCourse>;

async function getCourses(): Promise<Course[]> {
  await connectToDatabase(getMongoDBConnectionString());

  try {
    // Get courses from the vector store collection (where embeddings are stored)
    const collection = mongoose.connection.collection("courses");
    const docs = (await collection
      .find({}, { projection: { embedding: 0, content: 0 } })
      .sort({ _id: -1 })
      .toArray()) as Array<{ _id: mongoose.Types.ObjectId } & IBaseCourse>;

    return docs.map((d) => ({ id: d._id.toString(), ...d }));
  } finally {
    await disconnectFromDatabase();
  }
}

export default async function AdminCoursesPage() {
  const courses = await getCourses();

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

        {courses.length === 0 ? (
          <p className="text-gray-600">No courses found.</p>
        ) : (
          <ul className="space-y-3">
            {courses.map((c) => (
              <li key={c.id} className="rounded-md border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{c.title || "Untitled"}</div>
                    <div className="text-sm text-gray-600">
                      {c.difficulty ? `${c.difficulty} • ` : ""}{c.duration ? `${c.duration} min` : ""}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
