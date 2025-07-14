import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/connection';
import { Event } from '@/lib/models/Event';
import { getMongoDBConnectionString } from '@/lib/utils/env';

// GET /api/events - Get all events
export async function GET() {
  try {
    await connectToDatabase(getMongoDBConnectionString());
    const events = await Event.find({}).sort({ createdAt: -1 });
    
    return NextResponse.json({ events }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// POST /api/events - Create a new event
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description } = body;
    
    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }
    
    await connectToDatabase(getMongoDBConnectionString());
    
    const newEvent = new Event({
      title,
      description,
    });
    
    await newEvent.save();
    
    return NextResponse.json(
      { message: 'Event created successfully', event: newEvent },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
