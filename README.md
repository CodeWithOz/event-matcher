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

To test without touching production, run a local MongoDB with Atlas Vector Search in Docker (`docker-compose-local.yml`, uses the `mongodb/mongodb-atlas-local` image).

First, point `.env.local` at the local database (not your Atlas/production URI):

```
MONGODB_URI=mongodb://localhost:27018/event-matcher?directConnection=true
```

Then:

```bash
npm run db:up      # start the local database (host port 27018, override with MONGODB_LOCAL_PORT)
npm run db:init    # create collections and vector search indexes (first time only)
npm run seed       # seed local data
npm run db:down    # stop (data persists); `npm run db:reset` also deletes the data
```

The seed scripts delete existing data, so they refuse to run unless `MONGODB_URI` points to a local host. Set `ALLOW_REMOTE_DB=true` to override this deliberately.

### Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Automatic Short-Course Sync

A daily [Vercel Cron](https://vercel.com/docs/cron-jobs) job (see `vercel.json`) calls `GET /api/cron/sync-courses`, which:

1. Reads the DeepLearning.AI catalog page (`https://www.deeplearning.ai/courses`) and keeps the released courses whose `type` is `short_course` (long courses and specializations are skipped).
2. Skips courses already published (matched by URL slug or by title) or already queued.
3. Imports up to `COURSE_SYNC_MAX_IMPORTS` new courses per run (default 3, newest first) with the existing course importer, and stores them in the `pending_courses` collection.

Nothing is published automatically: review the queue at `/admin/courses/pending`, where **Review** opens the course form prefilled with the imported values (**Approve & Publish** creates the course and its embedding) and **Ignore** drops the course for good. Failed imports are retried by the next runs, up to 3 attempts.

Duplicate checks match courses by URL slug or normalized title, using the indexed fields `slug` and `normalizedTitle` on `courses` and `normalizedTitles` on `pending_courses` (see `src/lib/courses/identity.ts`). MongoDB has no schema migrations, so the app fills these fields on older documents (and recomputes those with accented titles) and creates the indexes by itself, on the first duplicate check of each server process (`src/lib/courses/ensure-identity.ts`); every step is idempotent and nothing has to run before a deploy. To do it right away anyway: `npm run db:backfill-identity`.

Ignoring only stops the automatic sync: a course can still be added by hand later. Adding a course by hand also takes it out of the queue (matched by URL slug or title), and approving a queued course that is already published is refused, so a course cannot be published twice. MongoDB enforces this for URLs too: `courses.slug` has a unique index (partial: courses without a slug are not constrained), so two requests publishing the same course at once cannot both succeed, and creating or editing a course with the URL of another one returns 409. If two courses already share a slug, the index cannot be created and duplicate checks fail with an error naming that slug until one of them is removed.

Setup on Vercel: set `CRON_SECRET` (generate with `openssl rand -hex 32`) in the project's environment variables; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`. On the Hobby plan, cron jobs run at most once a day, at some point within the scheduled hour.

To run a sync by hand (locally or in production):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-courses
```
