'use client';

import { useState } from 'react';
import { useForm, useFieldArray, SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CourseInputSchema } from '@/lib/validation/course';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AdminHeader from '@/components/admin/AdminHeader';

const schema = CourseInputSchema;

type FormValues = z.infer<typeof schema>;

export default function NewCoursePage() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    // auto-hide after 3s
    setTimeout(() => setToast(null), 3000);
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      title: '',
      description: '',
      duration: 0,
      studentProfile: '',
      learningGoals: [''],
      difficulty: 'Beginner',
      instructors: [{ name: '', title: '' }],
      courseItems: [{ title: '', duration: 0, usesCodeExample: false }],
      usesCodeExamples: false,
      url: '',
    },
    mode: 'onChange',
  });

  const instructorsArray = useFieldArray({ control: form.control, name: 'instructors' });
  const courseItemsArray = useFieldArray({ control: form.control, name: 'courseItems' });

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create course');
      }

      showToast('success', 'Course created successfully');
      form.reset();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unexpected error';
      showToast('error', message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="container mx-auto max-w-3xl py-8">
        <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Add New Course</CardTitle>
        </CardHeader>
        <CardContent>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Course title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="difficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Difficulty</FormLabel>
                      <FormControl>
                        <select className="border rounded-md h-9 px-3" {...field}>
                          <option value="Beginner">Beginner</option>
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Course description" rows={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="studentProfile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Student Profile</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Who is this course for?" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Learning Goals</FormLabel>
                <div className="space-y-2">
                  {form.watch('learningGoals').map((goal, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={goal}
                        onChange={(e) => {
                          const next = [...form.getValues('learningGoals')];
                          next[i] = e.target.value;
                          form.setValue('learningGoals', next, { shouldValidate: true });
                        }}
                        placeholder={`Goal ${i + 1}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          const next = form.getValues('learningGoals').filter((_, idx) => idx !== i);
                          form.setValue('learningGoals', next.length ? next : ['']);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => form.setValue('learningGoals', [...form.getValues('learningGoals'), ''])}
                  >
                    Add Goal
                  </Button>
                </div>
              </FormItem>

              <FormItem>
                <FormLabel>Instructors</FormLabel>
                <div className="space-y-3">
                  {instructorsArray.fields.map((f, i) => (
                    <div key={f.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                      <Input
                        placeholder="Name"
                        value={form.watch(`instructors.${i}.name`)}
                        onChange={(e) => form.setValue(`instructors.${i}.name`, e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="Title"
                          value={form.watch(`instructors.${i}.title`)}
                          onChange={(e) => form.setValue(`instructors.${i}.title`, e.target.value)}
                        />
                        <Button type="button" variant="outline" onClick={() => instructorsArray.remove(i)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => instructorsArray.append({ name: '', title: '' })}>Add Instructor</Button>
                </div>
              </FormItem>

              <FormItem>
                <FormLabel>Course Items</FormLabel>
                <div className="space-y-3">
                  {courseItemsArray.fields.map((f, i) => (
                    <div key={f.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                      <div className="md:col-span-3">
                        <Input
                          placeholder="Item title"
                          value={form.watch(`courseItems.${i}.title`)}
                          onChange={(e) => form.setValue(`courseItems.${i}.title`, e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Duration (min)"
                          value={form.watch(`courseItems.${i}.duration`) ?? 0}
                          onChange={(e) => form.setValue(`courseItems.${i}.duration`, Number(e.target.value))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id={`item-${i}-code`}
                          type="checkbox"
                          checked={form.watch(`courseItems.${i}.usesCodeExample`) || false}
                          onChange={(e) => form.setValue(`courseItems.${i}.usesCodeExample`, e.target.checked)}
                        />
                        <label htmlFor={`item-${i}-code`}>Code examples?</label>
                      </div>
                      <div className="md:col-span-6">
                        <Button type="button" variant="outline" onClick={() => courseItemsArray.remove(i)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => courseItemsArray.append({ title: '', duration: 0, usesCodeExample: false })}>Add Item</Button>
                </div>
              </FormItem>

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="usesCodeExamples"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <input id="usesCodeExamples" type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                        <FormLabel htmlFor="usesCodeExamples">Course uses code examples?</FormLabel>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://example.com/course" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => form.reset()}>Reset</Button>
                <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Creating…' : 'Create Course'}
                </Button>
              </div>
            </form>
          </Form>
          {/* Toast */}
          {toast && (
            <div
              role="status"
              aria-live="polite"
              className={`fixed bottom-6 right-6 z-50 rounded-md px-4 py-3 shadow-lg text-white ${
                toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {toast.message}
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
