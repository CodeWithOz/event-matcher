import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The LLM extraction reads its prompt files at runtime; make sure they are
  // copied into the serverless bundle (otherwise: ENOENT in production).
  outputFileTracingIncludes: {
    "/api/admin/courses/import": [
      "./src/lib/course-import/ai-extraction/*.md",
    ],
  },
};

export default nextConfig;
