'use client';

import { useState, type FormEvent } from 'react';
import { useForm, useFieldArray, SubmitHandler, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CourseInputSchema } from '@/lib/validation/course';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminHeader from '@/components/admin/AdminHeader';
import Link from 'next/link';
import type { CourseImportResult, ConfidenceLevel } from '@/lib/course-import';

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

const CONFIDENCE_BADGE_STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  medium: 'bg-amber-100 text-amber-800 border border-amber-300',
  low: 'bg-orange-100 text-orange-800 border border-orange-300',
};

const schema = CourseInputSchema;

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
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
};

export default function NewCoursePage() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [fieldConfidence, setFieldConfidence] = useState<Partial<Record<keyof FormValues, ConfidenceLevel>>>({});

  const renderConfidenceBadge = (field: keyof FormValues) => {
    const level = fieldConfidence[field];
    if (!level) {
      return null;
    }

    return (
      <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_BADGE_STYLES[level]}`}>
        {CONFIDENCE_LABEL[level]}
      </span>
    );
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    // auto-hide after 3s
    setTimeout(() => setToast(null), 3000);
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  const instructorsArray = useFieldArray({ control: form.control, name: 'instructors' });
  const courseItemsArray = useFieldArray({ control: form.control, name: 'courseItems' });
 
  const resetForm = () => {
    // Reset RHF state and reinitialize field arrays for consistent UI
    form.reset(DEFAULT_VALUES);
    instructorsArray.replace(DEFAULT_VALUES.instructors);
    courseItemsArray.replace(DEFAULT_VALUES.courseItems);
    setFieldConfidence({});
    // Also clear importer state
    setImportUrl('');
    setImportStatus('idle');
    setImportError(null);
    setImportWarnings([]);
  };

  const applyCourseImport = (result: CourseImportResult) => {
    const { course, warnings } = result;
    const currentValues = form.getValues();

    const importedGoals = Array.isArray(course.learningGoals.value)
      ? course.learningGoals.value.map((goal) => goal.trim()).filter(Boolean)
      : [];

    const suggestedLearningGoals = importedGoals.length
      ? importedGoals
      : currentValues.learningGoals.length
        ? currentValues.learningGoals
        : [''];

    const importedInstructors = Array.isArray(course.instructors.value)
      ? course.instructors.value
          .map((instructor) => ({
            name: (instructor.name ?? '').trim(),
            title: (instructor.title ?? '').trim(),
          }))
          .filter((instructor) => instructor.name)
      : [];

    const suggestedInstructors = importedInstructors.length
      ? importedInstructors
      : currentValues.instructors.length
        ? currentValues.instructors
        : [{ name: '', title: '' }];

    const importedItems = Array.isArray(course.courseItems.value)
      ? course.courseItems.value
          .map((item) => ({
            title: (item.title ?? '').trim(),
            duration: Number.isFinite(item.duration) ? item.duration : 0,
            usesCodeExample: Boolean(item.usesCodeExample),
          }))
          .filter((item) => item.title)
      : [];

    const suggestedItems = importedItems.length
      ? importedItems
      : currentValues.courseItems.length
        ? currentValues.courseItems
        : [{ title: '', duration: 0, usesCodeExample: false }];

    const mergedValues: FormValues = {
      ...currentValues,
      title: course.title.value ?? currentValues.title,
      description: course.description.value ?? currentValues.description,
      studentProfile: course.studentProfile.value ?? currentValues.studentProfile,
      learningGoals: suggestedLearningGoals,
      difficulty: course.difficulty.value ?? currentValues.difficulty,
      duration: course.duration.value ?? currentValues.duration,
      instructors: suggestedInstructors,
      courseItems: suggestedItems,
      usesCodeExamples: course.usesCodeExamples.value ?? currentValues.usesCodeExamples,
      url: course.url.value ?? currentValues.url ?? importUrl,
    };

    form.reset(mergedValues);
    instructorsArray.replace(mergedValues.instructors);
    courseItemsArray.replace(mergedValues.courseItems);

    const confidenceMap: Partial<Record<keyof FormValues, ConfidenceLevel>> = {};
    ( [
      ['title', 'title'],
      ['description', 'description'],
      ['studentProfile', 'studentProfile'],
      ['learningGoals', 'learningGoals'],
      ['difficulty', 'difficulty'],
      ['duration', 'duration'],
      ['instructors', 'instructors'],
      ['courseItems', 'courseItems'],
      ['usesCodeExamples', 'usesCodeExamples'],
      ['url', 'url'],
    ] as Array<[keyof FormValues, keyof CourseImportResult['course']]>).forEach(([formField, suggestionKey]) => {
      const suggestion = course[suggestionKey];
      if (!suggestion) return;

      const hasValue = Array.isArray(suggestion.value)
        ? suggestion.value.length > 0
        : suggestion.value !== null && suggestion.value !== '';

      if (!hasValue) return;

      if (suggestion.source === 'input' || suggestion.source === 'default') {
        return;
      }

      confidenceMap[formField] = suggestion.confidence;
    });

    setFieldConfidence(confidenceMap);
    setImportWarnings(warnings ?? []);
    setImportStatus('success');
    setImportError(null);
    setImportUrl(result.sourceUrl);
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUrl = importUrl.trim();
    if (!trimmedUrl) {
      setImportError('Enter a course URL to fetch details');
      setImportStatus('error');
      setImportWarnings([]);
      return;
    }

    setImportStatus('loading');
    setImportError(null);
    setImportWarnings([]);
    setFieldConfidence({});

    try {
      const response = await fetch('/api/admin/courses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const payload = (await response.json()) as Partial<CourseImportResult> & { error?: string };

      if (!response.ok || !payload || !payload.course) {
        throw new Error(payload?.error || 'Failed to import course');
      }

      applyCourseImport(payload as CourseImportResult);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to import course details';
      setImportStatus('error');
      setImportError(message);
      setImportWarnings([]);
    }
  };

  const isImporting = importStatus === 'loading';

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
      resetForm();
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
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="outline" asChild>
              <Link href="/admin/courses">← Back to Courses</Link>
            </Button>
          </div>
          <CardTitle>Add New Course</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <section className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
              <h2 className="text-lg font-semibold">Import From URL</h2>
              <p className="text-sm text-muted-foreground">Paste a course page URL and let the importer suggest values for you.</p>
              <form onSubmit={handleImport} className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  placeholder="https://example.com/course"
                  className="flex-1"
                  inputMode="url"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={isImporting} aria-busy={isImporting}>
                    {isImporting ? 'Fetching…' : 'Fetch details'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isImporting}
                    onClick={() => {
                      setImportUrl('');
                      setImportStatus('idle');
                      setImportError(null);
                      setImportWarnings([]);
                      setFieldConfidence({});
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
              {importStatus === 'success' && !importError && (
                <p className="mt-3 text-sm text-emerald-700">Fetched suggestions. Review the highlighted fields below before saving.</p>
              )}
              {importError && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {importError}
                </p>
              )}
              {importWarnings.length > 0 && (
                <Alert className="mt-3">
                  <AlertTitle>Review suggestions</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-5">
                      {importWarnings.map((warning, index) => (
                        <li key={index} className="text-sm">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </section>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center justify-between">
                        <span>Title</span>
                        {renderConfidenceBadge('title')}
                      </FormLabel>
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
                        <FormLabel className="flex items-center justify-between">
                          <span>Difficulty</span>
                          {renderConfidenceBadge('difficulty')}
                        </FormLabel>
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
                        <FormLabel className="flex items-center justify-between">
                          <span>Total Duration (minutes)</span>
                          {renderConfidenceBadge('duration')}
                        </FormLabel>
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
                      <FormLabel className="flex items-center justify-between">
                        <span>Description</span>
                        {renderConfidenceBadge('description')}
                      </FormLabel>
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
                      <FormLabel className="flex items-center justify-between">
                        <span>Student Profile</span>
                        {renderConfidenceBadge('studentProfile')}
                      </FormLabel>
                      <FormControl>
                        <Textarea placeholder="Who is this course for?" rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel className="flex items-center justify-between">
                    <span>Learning Goals</span>
                    {renderConfidenceBadge('learningGoals')}
                  </FormLabel>
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
                  <FormLabel className="flex items-center justify-between">
                    <span>Instructors</span>
                    {renderConfidenceBadge('instructors')}
                  </FormLabel>
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
                  <FormLabel className="flex items-center justify-between">
                    <span>Course Items</span>
                    {renderConfidenceBadge('courseItems')}
                  </FormLabel>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <input id="usesCodeExamples" type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                          <div className="flex items-center gap-2">
                            <FormLabel htmlFor="usesCodeExamples">Course uses code examples?</FormLabel>
                            {renderConfidenceBadge('usesCodeExamples')}
                          </div>
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
                        <FormLabel className="flex items-center justify-between">
                          <span>Course URL</span>
                          {renderConfidenceBadge('url')}
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com/course" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>Reset</Button>
                  <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting} aria-busy={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Creating…' : 'Create Course'}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
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
