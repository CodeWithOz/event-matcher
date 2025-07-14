'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

// Define the Event type
interface Event {
    _id: string;
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

export default function Home() {
    // State for the query input
    const [query, setQuery] = useState('');
    // State for the search results
    const [events, setEvents] = useState<Event[]>([]);
    // State for loading status
    const [isLoading, setIsLoading] = useState(false);
    // State for error message
    const [error, setError] = useState<string | null>(null);
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

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to search events');
            }

            setEvents(data.events || []);

            // Scroll to the first result after a short delay to ensure rendering is complete
            setTimeout(() => {
                if (firstResultRef.current && data.events?.length > 0) {
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
            setEvents([]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className='container mx-auto py-8 px-4 max-w-4xl'>
            <div className='mb-8 text-center'>
                <h1 className='text-3xl font-bold mb-2'>Event Matcher</h1>
                <p className='text-muted-foreground'>
                    Describe what you&apos;re looking for and we&apos;ll find
                    the best matching events
                </p>
            </div>

            <Card className='mb-8'>
                <CardHeader>
                    <CardTitle>Find Your Perfect Event</CardTitle>
                    <CardDescription>
                        Enter a description of what you&apos;re looking for in
                        an event
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className='space-y-4'>
                        <div className='space-y-2'>
                            <Label htmlFor='query'>Your preferences</Label>
                            <Textarea
                                id='query'
                                placeholder="Describe what you're looking for in an event..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                className='min-h-32'
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

            {error && (
                <Alert variant='destructive' className='mb-6'>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {events.length > 0 && (
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

            {isLoading && (
                <div className='flex justify-center my-8'>
                    <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary'></div>
                </div>
            )}

            {!isLoading && events.length === 0 && query && !error && (
                <Alert className='mb-6'>
                    <AlertDescription>
                        No matching events found. Try a different search query.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
