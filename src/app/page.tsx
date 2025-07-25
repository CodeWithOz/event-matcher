'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CourseCard } from '@/components/CourseCard';

// Define the Event type
interface Event {
    _id: string;
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

// Import IBaseCourse from the Course model
import { IBaseCourse } from '@/lib/models/Course';

// Define the Course type extending IBaseCourse
interface Course extends IBaseCourse {
    _id: string;
    createdAt?: string;
    updatedAt: string;
}

export default function Home() {
    // State for the query input
    const [query, setQuery] = useState('');
    // State for the search results
    const [events, setEvents] = useState<Event[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    // State for loading status
    const [isLoading, setIsLoading] = useState(false);
    // State for error message
    const [error, setError] = useState<string | null>(null);
    // State for active tab
    const [activeTab, setActiveTab] = useState('courses');
    // Reference to the first result for scrolling
    const firstResultRef = useRef<HTMLDivElement>(null);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!query.trim()) {
            setError('Please enter a search query');
            return;
        }

        setIsLoading(true);
        setError(null);
        
        // Reset results
        setEvents([]);
        setCourses([]);

        try {
            // Determine which endpoint to call based on active tab
            const endpoint = activeTab === 'events' ? '/api/search' : '/api/search/courses';
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Failed to search ${activeTab}`);
            }

            // Update the appropriate state based on active tab
            if (activeTab === 'events') {
                setEvents(data.events || []);
            } else {
                setCourses(data.courses || []);
            }

            // Scroll to the first result after a short delay to ensure rendering is complete
            setTimeout(() => {
                if (firstResultRef.current && 
                    ((activeTab === 'events' && data.events?.length > 0) || 
                     (activeTab === 'courses' && data.courses?.length > 0))) {
                    firstResultRef.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }
            }, 100);
        } catch (err: Error | unknown) {
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : 'An error occurred while searching';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className='container mx-auto py-8 px-4 max-w-4xl'>
            <div className='mb-8 text-center'>
                <h1 className='text-3xl font-bold mb-2'>Content Matcher</h1>
                <p className='text-muted-foreground'>
                    Describe what you&apos;re looking for and we&apos;ll find
                    the best matching content
                </p>
            </div>

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className='w-full'
            >
                <TabsList className='grid w-full grid-cols-2'>
                    <TabsTrigger value='courses'>Courses</TabsTrigger>
                    <TabsTrigger value='events'>Events</TabsTrigger>
                </TabsList>

                <TabsContent value='events' className='mt-6'>
                    <Card className='mb-8'>
                        <CardHeader>
                            <CardTitle>Find Your Perfect Event</CardTitle>
                            <CardDescription>
                                Enter a description of what you&apos;re looking
                                for in an event
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className='space-y-4'>
                                <div className='space-y-2'>
                                    <Label htmlFor='query'>
                                        Your preferences
                                    </Label>
                                    <Textarea
                                        id='query'
                                        placeholder="Describe what you're looking for in an event..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        className='min-h-32'
                                        onKeyDown={e => {
                                            // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
                                            if (
                                                (e.metaKey || e.ctrlKey) &&
                                                e.key === 'Enter'
                                            ) {
                                                handleSubmit(e);
                                            }
                                        }}
                                    />
                                </div>
                                <Button
                                    type='submit'
                                    disabled={isLoading}
                                    className='w-full'
                                >
                                    {isLoading
                                        ? 'Searching...'
                                        : 'Find Matching Events'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value='courses' className='mt-6'>
                    <Card className='mb-8'>
                        <CardHeader>
                            <CardTitle>Find Your Perfect Course</CardTitle>
                            <CardDescription>
                                Enter a description of what you&apos;re looking
                                for in a course
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className='space-y-4'>
                                <div className='space-y-2'>
                                    <Label htmlFor='query'>
                                        Your preferences
                                    </Label>
                                    <Textarea
                                        id='query'
                                        placeholder="Describe what you're looking for in a course..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        className='min-h-32'
                                        onKeyDown={e => {
                                            // Check for Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
                                            if (
                                                (e.metaKey || e.ctrlKey) &&
                                                e.key === 'Enter'
                                            ) {
                                                handleSubmit(e);
                                            }
                                        }}
                                    />
                                </div>
                                <Button
                                    type='submit'
                                    disabled={isLoading}
                                    className='w-full'
                                >
                                    {isLoading
                                        ? 'Searching...'
                                        : 'Find Matching Courses'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {error && (
                <Alert variant='destructive' className='mb-6'>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Display results based on active tab */}
            {activeTab === 'events' && events.length > 0 && (
                <div className='space-y-6'>
                    <h2 className='text-2xl font-semibold'>Matching Events</h2>

                    {events.map((event, index) => (
                        <Card
                            key={event._id}
                            ref={index === 0 ? firstResultRef : undefined}
                            className={index === 0 ? 'border-primary' : ''}
                        >
                            <CardHeader>
                                <CardTitle>{event.title}</CardTitle>
                                <CardDescription>
                                    {new Date(
                                        event.createdAt
                                    ).toLocaleDateString()}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>{event.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Display course results */}
            {activeTab === 'courses' && courses.length > 0 && (
                <div className='space-y-6'>
                    <h2 className='text-2xl font-semibold'>Matching Courses</h2>

                    {courses.map((course, index) => (
                        <CourseCard
                            key={course._id}
                            course={course}
                            isFirstResult={index === 0}
                            ref={index === 0 ? firstResultRef : undefined}
                        />
                    ))}
                </div>
            )}

            {isLoading && (
                <div className='flex justify-center my-8'>
                    <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary'></div>
                </div>
            )}

            {!isLoading && query && !error && (
                <>
                    {activeTab === 'events' && events.length === 0 && (
                        <Alert className='mb-6'>
                            <AlertDescription>
                                No matching events found. Try a different search
                                query.
                            </AlertDescription>
                        </Alert>
                    )}
                    {activeTab === 'courses' && courses.length === 0 && (
                        <Alert className='mb-6'>
                            <AlertDescription>
                                No matching courses found. Try a different
                                search query.
                            </AlertDescription>
                        </Alert>
                    )}
                </>
            )}

            {/* Attribution footer */}
            <footer className='mt-12 text-center text-sm text-muted-foreground pb-4'>
                Created by{' '}
                <a
                    href='https://www.linkedin.com/in/uchechukwu-ozoemena/'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='hover:underline'
                >
                    CodeWithOz
                </a>
            </footer>
        </div>
    );
}
