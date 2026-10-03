# Content Matcher

A web application that uses vector-based similarity search to find courses and events that best match a user's provided description. This application uses Next.js, MongoDB Atlas, LangChain, and OpenAI embeddings.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

### Prerequisites

- Node.js (v18 or later)
- MongoDB Atlas account
- OpenAI API key

### Environment Variables

Copy the `env.sample` file to `.env.local` and fill in your MongoDB Atlas connection string and OpenAI API key:

```bash
cp env.sample .env.local
```

Then edit `.env.local` with your actual credentials:

```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
OPENAI_API_KEY=your_openai_api_key_here
EVENT_VECTOR_SEARCH_INDEX_NAME=event_vector_index
COURSE_VECTOR_SEARCH_INDEX_NAME=course_vector_index
```

### MongoDB Atlas Vector Search Setup

1. Create a MongoDB Atlas cluster if you don't have one already
2. Create a database with the following collections:
   - `events` and `event_embeddings` for event data
   - `courses` for course data (includes embedded vectors)
3. Set up vector search indexes with the following configurations:

   **For Events:**
   - Index name: `event_vector_index` (or whatever you specified in EVENT_VECTOR_SEARCH_INDEX_NAME)
   - Collection: `event_embeddings`
   - Field to index: `embedding`
   - Dimension: 3072 (for OpenAI's text-embedding-3-large model)
   - Metric: cosine
   
   **For Courses:**
   - Index name: `course_vector_index` (or whatever you specified in COURSE_VECTOR_SEARCH_INDEX_NAME)
   - Collection: `courses`
   - Field to index: `embedding`
   - Dimension: 3072 (for OpenAI's text-embedding-3-large model)
   - Metric: cosine

### Installation

Install the dependencies:

```bash
npm install
```

## Getting Started

### Seed the Database

To populate the database with sample content and generate embeddings:

**For Events:**
```bash
npx ts-node src/scripts/seed-events.ts
```

**For Courses:**
```bash
npx ts-node src/scripts/seed-courses.ts
```

### Local Database (recommended for testing)

To test without touching production, run a local MongoDB with Atlas Vector Search in Docker (`docker-compose-local.yml`, uses the `mongodb/mongodb-atlas-local` image):

```bash
npm run db:up      # start the local database (host port 27018, override with MONGODB_LOCAL_PORT)
npm run db:init    # create collections and vector search indexes (first time only)
npm run seed       # seed local data
npm run db:down    # stop (data persists); `npm run db:reset` also deletes the data
```

Point `.env.local` at it:

```
MONGODB_URI=mongodb://localhost:27018/event-matcher?directConnection=true
```

The seed scripts delete existing data, so they refuse to run unless `MONGODB_URI` points to a local host. Set `ALLOW_REMOTE_DB=true` to override this deliberately.

### Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.