# Event Matcher

A web application that matches user preferences to events using AI-powered similarity search. This application uses Next.js, MongoDB Atlas, LangChain, and OpenAI embeddings to find events that best match a user's text description.

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
VECTOR_SEARCH_INDEX_NAME=event_vector_index
```

### MongoDB Atlas Vector Search Setup

1. Create a MongoDB Atlas cluster if you don't have one already
2. Create a database and two collections: `events` and `event_embeddings`
3. Set up a vector search index on the `event_embeddings` collection with the following configuration:
   - Index name: `event_vector_index` (or whatever you specified in your env variables)
   - Field to index: `embedding`
   - Dimension: 1536 (for OpenAI's text-embedding-3-large model)
   - Metric: cosine

### Installation

Install the dependencies:

```bash
npm install
```

## Getting Started

### Seed the Database

To populate the database with sample events and generate their embeddings:

```bash
npx ts-node src/scripts/seed-events.ts
```

### Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
