import { readFile } from 'fs/promises';
import { join } from 'path';


export async function readPromptFile(fileName: string): Promise<string> {
  const filePath = join(process.cwd(), 'src', 'lib', 'course-import', 'ai-extraction', fileName);
  return readFile(filePath, 'utf8');
}

// Inline prompt and few-shot examples for LLM extraction. This avoids runtime fs access and is safe for Vercel deployments.

export const SYS_PROMPT_FALLBACK = [
  "# System prompt",
  "",
  "You are an information extraction model. Your task is to read a single course web page (raw HTML) and return a JSON object that **exactly** matches the following Zod schema:",
  "",
  "```",
  "CourseExtractionSchema = {",
  "  title: string | null,",
  "  description: string | null,",
  "  studentProfile: string | null,",
  "  learningGoals: string[] | null,",
  "  difficulty: string | null,",
  "  durationMinutes: number | null,",
  "  usesCodeExamples: boolean | null,",
  "  instructors: Array<{ name: string | null; title: string | null; }> | null,",
  "  courseItems: Array<{ title: string | null; durationMinutes: number | null; usesCodeExample: boolean | null; }> | null,",
  "  url: string | null",
  "}",
  "```",
  "",
  "## Required behavior",
  "",
  "* **Do not fabricate**. If a field is not present in the HTML, set it to `null` (or `[]` for arrays if you must return an array; `null` is preferred here as per the schema’s `.nullish()`).",
  "* Extract:",
  "",
  "  * **title**: page/course title.",
  "  * **description**: the “About this course”/overview text (strip HTML).",
  "  * **studentProfile**: the “Who should join?”/“Who is this for?” text.",
  "  * **learningGoals**: bullet points from sections like “What you’ll learn”, “In detail, you’ll…”, or equivalent. Use concise phrasing; 3–12 items is fine.",
  "  * **difficulty** and **durationMinutes**: from summary/hero/metadata (e.g., “Intermediate”, “1 Hour” ⇒ `60`).",
  "  * **usesCodeExamples** (course-level): `true` if the page explicitly states there are code examples anywhere (e.g., “4 code examples”), otherwise `false` if it explicitly says “0 Code Examples”, otherwise `null` if unclear.",
  "  * **instructors**: list of `{name, title}` from “Instructors”/hero metadata.",
  "  * **courseItems**: the outline/lesson list. For each item:",
  "",
  "    * **title**: lesson title.",
  "    * **durationMinutes**: parse “3 mins” ⇒ `3`, “11 mins” ⇒ `11`. If only seconds are available, convert to minutes (265s ⇒ `4` rounded to nearest whole minute).",
  "    * **usesCodeExample**: `true` only if the item explicitly mentions code examples (e.g., “Video with code examples”); `false` if the page says the course has “0 Code Examples”; otherwise `null` when unspecified.",
  "  * **url**: canonical/hero enrollment link to the course page if present.",
  "* **Normalization rules**",
  "",
  "  * Remove HTML tags, trim whitespace, and collapse multi-spaces.",
  "  * Convert durations to **minutes** (integers). If duration shows “1 Hour”, return `60`. If the total duration isn’t stated and can’t be reliably summed, set `durationMinutes` to `null`.",
  "  * Preserve diacritics and punctuation in text fields.",
  "* **Output format**",
  "",
  "  * Return **only** the JSON object matching the schema. No extra keys. No commentary.",
  "",
  "If any part of the page is ambiguous or missing, prefer `null` over guessing.",
].join("\n");

export const EXAMPLE_1_HUMAN_FALLBACK = `<!DOCTYPE html>
<html>
  <head>
    <title>Claude Code: A Highly Agentic Coding Assistant - DeepLearning.AI</title>
    <link rel="canonical" href="https://www.deeplearning.ai/short-courses/claude-code-a-highly-agentic-coding-assistant/"/>
  </head>
  <body>
    <section data-hero>
      <h1>Claude Code: A Highly Agentic Coding Assistant</h1>
      <ul class="summary-card">
        <li>Intermediate</li>
        <li>1 Hour 50 Minutes</li>
        <li>Elie Schoppik</li>
      </ul>
    </section>

    <section>
      <h2>What you’ll learn</h2>
      <ul>
        <li>Use Claude code to explore, develop, test, refactor, and debug codebases.</li>
        <li>Extend the capabilities of Claude Code with MCP servers such as Playwright and Figma MCP servers.</li>
        <li>Apply Claude Code best practices to three projects: exploring and developing the codebase of a RAG chatbot, refactoring a Jupyter notebook for e-commerce data and transforming it into a dashboard, and building a web app from a Figma mockup.</li>
      </ul>
    </section>

    <section>
      <h2>About this course</h2>
      <p>In this course, you’ll learn best practices for using Claude Code to improve your coding workflow. You’ll learn key tips on how to provide Claude Code with clear context, such as specifying the relevant files, clearly defining the features and functionality, and connecting Claude Code to MCP servers. You’ll apply these best practices to three examples: exploring a RAG chatbot codebase, analyzing ecommerce data in a Jupyter notebook, and creating a web app based on a Figma mockup.</p>
      <h3>In detail, using Claude Code, you’ll:</h3>
      <ul>
        <li>Understand the underlying architecture of Claude Code and how it stores memory across sessions.</li>
        <li>Explore and understand the codebase of a RAG chatbot.</li>
        <li>Initiate a CLAUDE.md file with information about your codebase.</li>
        <li>Control context via escape, clear, and compact commands.</li>
        <li>Plan first, use thinking mode, and brainstorm with subagents.</li>
        <li>Write tests for chatbot functionality and refactor parts of the code.</li>
        <li>Use git worktrees to run multiple Claude sessions simultaneously.</li>
        <li>Fix GitHub issues and work with PRs using Claude Code’s integration.</li>
        <li>Execute code via hooks; refactor a Jupyter notebook into a dashboard.</li>
        <li>Use Figma and Playwright MCP servers to develop UI and improve designs.</li>
      </ul>
    </section>

    <section>
      <h2>Who should join?</h2>
      <p>This course is ideal for anyone who wants to explore how AI coding assistant tools like Claude Code can enhance their development process. Whether you're building applications, debugging code, or exploring unfamiliar codebases, you’ll gain practical skills to work more efficiently with AI-assisted workflows. You can make the best of the course if you’re familiar with Python and Git.</p>
    </section>

    <section>
      <h2>Course Outline</h2>
      <div>10 Lessons・0 Code Examples</div>
      <ul>
        <li><span>Introduction</span> — <span>Video</span> — <span>4 mins</span></li>
        <li><span>What is Claude Code?</span> — <span>Video</span> — <span>8 mins</span></li>
        <li><span>Course Notes</span> — <span>Reading</span> — <span>1 min</span></li>
        <li><span>Setup & Codebase Understanding</span> — <span>Video</span> — <span>14 mins</span></li>
        <li><span>Adding Features</span> — <span>Video</span> — <span>17 mins</span></li>
        <li><span>Testing, Error Debugging and Code Refactoring</span> — <span>Video</span> — <span>12 mins</span></li>
        <li><span>Adding Multiple Features Simultaneously</span> — <span>Video</span> — <span>11 mins</span></li>
        <li><span>Exploring Github Integration & Hooks</span> — <span>Video</span> — <span>10 mins</span></li>
        <li><span>Refactoring a Jupyter Notebook & Creating a Dashboard</span> — <span>Video</span> — <span>12 mins</span></li>
        <li><span>Creating Web App based on a Figma Mockup</span> — <span>Video</span> — <span>9 mins</span></li>
        <li><span>Conclusion</span> — <span>Video</span> — <span>1 min</span></li>
        <li><span>Quiz</span> — <span>Video</span> — <span>7 mins</span></li>
        <li><span>Prompts & Summaries of Lessons</span> — <span>Video</span> — <span>1 min</span></li>
      </ul>
    </section>

    <section>
      <h2>Instructors</h2>
      <div>
        <h3>Elie Schoppik</h3>
        <p>Head of Technical Education at Anthropic</p>
      </div>
    </section>
  </body>
</html>
`;

export const EXAMPLE_1_AI = `{
  "title": "Claude Code: A Highly Agentic Coding Assistant",
  "description": "In this course, you’ll learn best practices for using Claude Code to improve your coding workflow. You’ll learn key tips on how to provide Claude Code with clear context, such as specifying the relevant files, clearly defining the features and functionality, and connecting Claude Code to MCP servers. You’ll apply these best practices to three examples: exploring a RAG chatbot codebase, analyzing ecommerce data in a Jupyter notebook, and creating a web app based on a Figma mockup.\n\nIn detail, using Claude Code, you’ll:\nUnderstand the underlying architecture of Claude Code and how it stores memory across sessions.\nExplore and understand the codebase of a RAG chatbot.\nInitiate a CLAUDE.md file with information about your codebase.\nControl context via escape, clear, and compact commands.\nPlan first, use thinking mode, and brainstorm with subagents.\nWrite tests for chatbot functionality and refactor parts of the code.\nUse git worktrees to run multiple Claude sessions simultaneously.\nFix GitHub issues and work with PRs using Claude Code’s integration.\nExecute code via hooks; refactor a Jupyter notebook into a dashboard.\nUse Figma and Playwright MCP servers to develop UI and improve designs.",
  "studentProfile": "This course is ideal for anyone who wants to explore how AI coding assistant tools like Claude Code can enhance their development process. Whether you're building applications, debugging code, or exploring unfamiliar codebases, you’ll gain practical skills to work more efficiently with AI-assisted workflows. You can make the best of the course if you’re familiar with Python and Git.",
  "learningGoals": [
    "Use Claude code to explore, develop, test, refactor, and debug codebases.",
    "Extend the capabilities of Claude Code with MCP servers such as Playwright and Figma MCP servers.",
    "Apply Claude Code best practices to three projects: exploring and developing the codebase of a RAG chatbot, refactoring a Jupyter notebook for e-commerce data and transforming it into a dashboard, and building a web app from a Figma mockup."
  ],
  "difficulty": "Intermediate",
  "durationMinutes": 110,
  "usesCodeExamples": false,
  "instructors": [
    { "name": "Elie Schoppik", "title": "Head of Technical Education at Anthropic" }
  ],
  "courseItems": [
    { "title": "Introduction", "durationMinutes": 4, "usesCodeExample": false },
    { "title": "What is Claude Code?", "durationMinutes": 8, "usesCodeExample": false },
    { "title": "Course Notes", "durationMinutes": 1, "usesCodeExample": false },
    { "title": "Setup & Codebase Understanding", "durationMinutes": 14, "usesCodeExample": false },
    { "title": "Adding Features", "durationMinutes": 17, "usesCodeExample": false },
    { "title": "Testing, Error Debugging and Code Refactoring", "durationMinutes": 12, "usesCodeExample": false },
    { "title": "Adding Multiple Features Simultaneously", "durationMinutes": 11, "usesCodeExample": false },
    { "title": "Exploring Github Integration & Hooks", "durationMinutes": 10, "usesCodeExample": false },
    { "title": "Refactoring a Jupyter Notebook & Creating a Dashboard", "durationMinutes": 12, "usesCodeExample": false },
    { "title": "Creating Web App based on a Figma Mockup", "durationMinutes": 9, "usesCodeExample": false },
    { "title": "Conclusion", "durationMinutes": 1, "usesCodeExample": false },
    { "title": "Quiz", "durationMinutes": 7, "usesCodeExample": false },
    { "title": "Prompts & Summaries of Lessons", "durationMinutes": 1, "usesCodeExample": false }
  ],
  "url": "https://www.deeplearning.ai/short-courses/claude-code-a-highly-agentic-coding-assistant/"
}
`;

export const EXAMPLE_2_HUMAN = `<!DOCTYPE html>
<html>
  <head>
    <title>Knowledge Graphs for AI Agent API Discovery - DeepLearning.AI</title>
    <link rel="canonical" href="https://www.deeplearning.ai/short-courses/knowledge-graphs-for-ai-agent-api-discovery/"/>
  </head>
  <body>
    <section data-hero>
      <h1>Knowledge Graphs for AI Agent API Discovery</h1>
      <ul class="summary-card">
        <li>Intermediate</li>
        <li>1 Hour 14 Minutes</li>
        <li>Pavithra G K, Lars Heling</li>
      </ul>
    </section>

    <section>
      <h2>What you’ll learn</h2>
      <ul>
        <li>Construct a knowledge graph: Transform API specifications into a structured graph, then connect previously isolated APIs through business process data.</li>
        <li>Improve API discovery: Do semantic retrieval, and then use business process information from the knowledge graph to discover missing prerequisite APIs and their proper calling sequence.</li>
        <li>Build the agent: Create an agent that uses the knowledge graph to discover and execute APIs to carry out real tasks while following the correct process sequence.</li>
      </ul>
    </section>

    <section>
      <h2>About this course</h2>
      <p>Learn how to help AI agents find and execute the right APIs in the right order using a knowledge graph. Large companies may have thousands of APIs; this course brings API specifications into a knowledge graph and extends it with process data so an agent knows when, and in which order, each API should be called.</p>
      <p>In detail, you’ll:</p>
      <ul>
        <li>Understand what knowledge graphs are and how they enable API discovery and execution.</li>
        <li>Construct your first knowledge graph from API services and endpoints and visualize it.</li>
        <li>Extend the graph with business-process data and dependencies.</li>
        <li>Perform semantic retrieval and add process edges to get required APIs and their order.</li>
        <li>Build an agent that uses the graph to discover and execute APIs in the right sequence.</li>
      </ul>
      <p>By the end of this course, you’ll have constructed a knowledge graph from API specifications and business process information and built an agent that can take business actions by discovering the right APIs and executing them in the right order.</p>
    </section>

    <section>
      <h2>Who should join?</h2>
      <p>This course is ideal for developers and AI builders working with large API ecosystems who need agents to choose the right services and calling order. Basic Python knowledge is required.</p>
    </section>

    <section>
      <h2>Course Outline</h2>
      <div>7 Lessons・4 Code Examples</div>
      <ul>
        <li><span>Introduction</span> — <span>Video</span> — <span>3 mins</span></li>
        <li><span>Knowledge Graphs for AI Agents</span> — <span>Video</span> — <span>9 mins</span></li>
        <li><span>API Knowledge Graph Construction</span> — <span>Video with code examples</span> — <span>18 mins</span></li>
        <li><span>Integration with Business Processes</span> — <span>Video with code examples</span> — <span>9 mins</span></li>
        <li><span>API Discovery with Knowledge Graphs</span> — <span>Video with code examples</span> — <span>12 mins</span></li>
        <li><span>Business Process Agent</span> — <span>Video with code examples</span> — <span>11 mins</span></li>
        <li><span>Conclusion</span> — <span>Video</span> — <span>1 min</span></li>
        <li><span>Quiz</span> — <span>Reading</span> — <span>9 mins</span></li>
      </ul>
    </section>

    <section>
      <h2>Instructors</h2>
      <div>
        <h3>Pavithra G K</h3>
        <p>Head of Business Knowledge Graphs at SAP Business AI</p>
      </div>
      <div>
        <h3>Lars Heling</h3>
        <p>Senior Knowledge Engineer at SAP Business AI</p>
      </div>
    </section>
  </body>
</html>
`;

export const EXAMPLE_2_AI_FALLBACK = `{
  "title": "Knowledge Graphs for AI Agent API Discovery",
  "description": "Learn how to help AI agents find and execute the right APIs in the right order using a knowledge graph. Large companies may have thousands of APIs; this course brings API specifications into a knowledge graph and extends it with process data so an agent knows when, and in which order, each API should be called.\n\nIn detail, you’ll:\nUnderstand what knowledge graphs are and how they enable API discovery and execution.\nConstruct your first knowledge graph from API services and endpoints and visualize it.\nExtend the graph with business-process data and dependencies.\nPerform semantic retrieval and add process edges to get required APIs and their order.\nBuild an agent that uses the graph to discover and execute APIs in the right sequence.\n\nBy the end of this course, you’ll have constructed a knowledge graph from API specifications and business process information and built an agent that can take business actions by discovering the right APIs and executing them in the right order.",
  "studentProfile": "This course is ideal for developers and AI builders working with large API ecosystems who need agents to choose the right services and calling order. Basic Python knowledge is required.",
  "learningGoals": [
    "Construct a knowledge graph: Transform API specifications into a structured graph, then connect previously isolated APIs through business process data.",
    "Improve API discovery: Do semantic retrieval, and then use business process information from the knowledge graph to discover missing prerequisite APIs and their proper calling sequence.",
    "Build the agent: Create an agent that uses the knowledge graph to discover and execute APIs to carry out real tasks while following the correct process sequence.",
  ],
  "difficulty": "Intermediate",
  "durationMinutes": 74,
  "usesCodeExamples": true,
  "instructors": [
    { "name": "Pavithra G K", "title": "Head of Business Knowledge Graphs at SAP Business AI" },
    { "name": "Lars Heling", "title": "Senior Knowledge Engineer at SAP Business AI" }
  ],
  "courseItems": [
    { "title": "Introduction", "durationMinutes": 3, "usesCodeExample": null },
    { "title": "Knowledge Graphs for AI Agents", "durationMinutes": 9, "usesCodeExample": null },
    { "title": "API Knowledge Graph Construction", "durationMinutes": 18, "usesCodeExample": true },
    { "title": "Integration with Business Processes", "durationMinutes": 9, "usesCodeExample": true },
    { "title": "API Discovery with Knowledge Graphs", "durationMinutes": 12, "usesCodeExample": true },
    { "title": "Business Process Agent", "durationMinutes": 11, "usesCodeExample": true },
    { "title": "Conclusion", "durationMinutes": 1, "usesCodeExample": null },
    { "title": "Quiz", "durationMinutes": 9, "usesCodeExample": null }
  ],
  "url": "https://www.deeplearning.ai/short-courses/knowledge-graphs-for-ai-agent-api-discovery/"
}
`;
