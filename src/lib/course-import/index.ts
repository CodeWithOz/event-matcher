import { CourseInput } from '@/lib/validation/course';
import { CourseFieldSuggestions, CourseImportError, CourseImportResult, ConfidenceLevel } from '@/lib/course-import/types';

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

type PartialCourseDraft = Partial<CourseInput> & {
  learningGoals?: string[];
  instructors?: Array<{ name: string; title: string }>;
  courseItems?: Array<{ title: string; duration: number; usesCodeExample: boolean }>;
};

type ExtractionContext = {
  html: string;
  url: string;
};

export async function importCourseFromUrl(url: string): Promise<CourseImportResult> {
  const normalizedUrl = normalizeUrl(url);
  const fetchStart = Date.now();
  const { html, contentType } = await fetchCoursePage(normalizedUrl);
  const fetchMs = Date.now() - fetchStart;

  const extractStart = Date.now();
  const { suggestions, warnings: extractionWarnings } = extractCourseSuggestions({ html, url: normalizedUrl });
  const extractMs = Date.now() - extractStart;

  const normalizeStart = Date.now();
  const { course, warnings: normalizationWarnings } = normalizeCourseSuggestions(suggestions, normalizedUrl);
  const normalizeMs = Date.now() - normalizeStart;

  const warnings = [...extractionWarnings, ...normalizationWarnings];

  console.info('[course-import] Completed import', {
    url: normalizedUrl,
    warnings: warnings.length,
    timings: { fetchMs, extractMs, normalizeMs },
  });

  return {
    sourceUrl: normalizedUrl,
    course,
    warnings,
    metadata: {
      contentType,
      fetchedAt: new Date().toISOString(),
      htmlBytes: Buffer.byteLength(html, 'utf8'),
      timings: {
        fetchMs,
        extractMs,
        normalizeMs,
      },
    },
    rawHtmlPreview: html.slice(0, 2000),
  };
}

function normalizeUrl(input: string): string {
  try {
    const url = new URL(input);
    return url.toString();
  } catch {
    throw new CourseImportError('FETCH_FAILED', 'Invalid URL provided');
  }
}

async function fetchCoursePage(url: string): Promise<{ html: string; contentType: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CourseImporterBot/1.0 (+https://event-matcher-admin)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CourseImportError('FETCH_FAILED', `Received status ${response.status} from source`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.includes('text/html')) {
      throw new CourseImportError('UNSUPPORTED_CONTENT', 'The provided URL did not return HTML content');
    }

    const html = await response.text();
    return { html, contentType };
  } catch (error) {
    if (error instanceof CourseImportError) {
      throw error;
    }

    if ((error as Error).name === 'AbortError') {
      throw new CourseImportError('FETCH_FAILED', 'Timed out while fetching the course page');
    }

    throw new CourseImportError('FETCH_FAILED', 'Failed to fetch the course page');
  } finally {
    clearTimeout(timeout);
  }
}

function extractCourseSuggestions(context: ExtractionContext): { suggestions: CourseFieldSuggestions; warnings: string[] } {
  const suggestions = createEmptySuggestions(context.url);
  const warnings: string[] = [];

  const nextDataExtraction = extractNextDataDraft(context.html);
  if (nextDataExtraction.draft) {
    applyDraftToSuggestions(suggestions, nextDataExtraction.draft, 'high', 'next-data');
  }
  warnings.push(...nextDataExtraction.warnings);

  const jsonLdCourses = extractJsonLdCourses(context.html);
  if (jsonLdCourses.length > 0) {
    for (const course of jsonLdCourses) {
      applyDraftToSuggestions(suggestions, course, 'high', 'jsonld');
    }
  } else {
    warnings.push('No Course schema JSON-LD detected');
  }

  const metaDraft = extractMetaDraft(context.html);
  if (metaDraft) {
    applyDraftToSuggestions(suggestions, metaDraft, 'medium', 'meta');
  }

  if (!suggestions.description.value) {
    const textDraft = extractFromDocumentText(context.html);
    if (textDraft) {
      applyDraftToSuggestions(suggestions, textDraft, 'low', 'text');
    }
  }

  return { suggestions, warnings };
}

function extractNextDataDraft(html: string): { draft: PartialCourseDraft | null; warnings: string[] } {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    return { draft: null, warnings: [] };
  }

  try {
    const payload = JSON.parse(decodeHtmlEntities(match[1]));
    const pageProps = payload?.props?.pageProps;
    if (!pageProps || typeof pageProps !== 'object') {
      return { draft: null, warnings: ['Next.js payload missing pageProps'] };
    }

    const course = (pageProps as { course?: unknown }).course;
    const outlineListRaw = (pageProps as { outlineList?: unknown }).outlineList;

    if (!course || typeof course !== 'object') {
      return { draft: null, warnings: ['Next.js payload missing course data'] };
    }

    const courseRecord = course as Record<string, unknown>;
    const draft: PartialCourseDraft = {};
    const warnings: string[] = [];

    if (typeof courseRecord.title === 'string') {
      draft.title = sanitizeText(courseRecord.title);
    } else {
      warnings.push('Course title missing in Next.js payload');
    }

    const seo = courseRecord.seo as Record<string, unknown> | undefined;
    const layout = Array.isArray((courseRecord.visualEditor as { pageLayout?: unknown })?.pageLayout)
      ? ((courseRecord.visualEditor as { pageLayout: Array<Record<string, unknown>> }).pageLayout)
      : [];

    const heroBlock = findHeroBlock(layout);
    if (heroBlock) {
      if (typeof heroBlock.level === 'string') {
        const level = normalizeDifficulty(heroBlock.level);
        if (level) {
          draft.difficulty = level;
        }
      }

      if (typeof heroBlock.duration === 'string') {
        const durationMinutes = parseDurationFromDisplay(heroBlock.duration);
        if (durationMinutes !== null) {
          draft.duration = durationMinutes;
        }
      }
    }

    const aboutBlock = findBlockByTitle(layout, /about this course/i);
    if (aboutBlock) {
      const text = extractBlockText(aboutBlock.body, { preserveLineBreaks: true });
      if (text) {
        draft.description = text;
      }
    }

    if (!draft.description && typeof seo?.metaDesc === 'string') {
      draft.description = sanitizeText(seo.metaDesc);
    }

    if (!draft.description && typeof courseRecord.content === 'string') {
      const text = extractBlockText(courseRecord.content, { preserveLineBreaks: true });
      if (text) {
        draft.description = text;
      }
    }

    const audienceBlock = findBlockByTitle(layout, /(who should join|who is this course for)/i);
    if (audienceBlock) {
      const text = extractBlockText(audienceBlock.body, { preserveLineBreaks: true });
      if (text) {
        draft.studentProfile = text;
      }
    }

    const featuresBlock = layout.find((block) => Array.isArray((block as Record<string, unknown>).featuresGrid)) as
      | (Record<string, unknown> & { featuresGrid: Array<Record<string, unknown>> })
      | undefined;

    if (featuresBlock) {
      const goals = featuresBlock.featuresGrid
        .map((feature) => {
          const value = typeof feature.feature === 'string' ? feature.feature : typeof feature.featureReachText === 'string' ? feature.featureReachText : '';
          const text = extractBlockText(value);
          return text;
        })
        .filter((value): value is string => Boolean(value));

      if (goals.length > 0) {
        draft.learningGoals = goals;
      }
    }

    const shortCourse = courseRecord.shortCourse as Record<string, unknown> | undefined;
    if (shortCourse && Array.isArray(shortCourse.instructors)) {
      const instructors = shortCourse.instructors
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const node = entry as Record<string, unknown>;
          const instructor = node.instructor as Record<string, unknown> | undefined;
          if (!instructor) return null;
          const name = typeof instructor.title === 'string' ? sanitizeText(instructor.title) : null;
          if (!name) return null;
          const person = instructor.person as Record<string, unknown> | undefined;
          const jobTitleRich = person && typeof person.jobTitleRichText === 'string' ? person.jobTitleRichText : null;
          const jobTitlePlain = person && typeof person.jobTitle === 'string' ? person.jobTitle : null;
          const titleText = jobTitleRich ? extractBlockText(jobTitleRich) : jobTitlePlain ? sanitizeText(jobTitlePlain) : '';
          return { name, title: titleText || 'Instructor' };
        })
        .filter((instructor): instructor is { name: string; title: string } => Boolean(instructor));

      if (instructors.length > 0) {
        draft.instructors = instructors;
      }
    }

    const outlineEntries = Array.isArray(outlineListRaw)
      ? (outlineListRaw as Array<Record<string, unknown>>).filter((item) => item && typeof item === 'object')
      : [];

    if (outlineEntries.length > 0) {
      if (Array.isArray(outlineEntries[0]) && outlineEntries[0].length > 0) {
        let totalSeconds = 0;
        const courseItems = outlineEntries[0]
          .map((entry) => {
            const title =
              typeof entry.name === "string" ? sanitizeText(entry.name) : null;
            if (!title) return null;
            const usesCodeExample =
              typeof entry.type === "string"
                ? entry.type === "video_notebook"
                : false;
            const seconds = typeof entry.time === "number" ? entry.time : 0;
            totalSeconds += seconds;
            const minutes =
              seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
            return {
              title,
              duration: minutes,
              usesCodeExample: usesCodeExample,
            };
          })
          .filter(
            (
              item
            ): item is {
              title: string;
              duration: number;
              usesCodeExample: boolean;
            } => Boolean(item)
          );

        if (courseItems.length > 0) {
          draft.courseItems = courseItems;
        }

        if (!draft.duration && totalSeconds > 0) {
          draft.duration = Math.max(1, Math.round(totalSeconds / 60));
        }
      }
    }

    if (!draft.studentProfile && typeof courseRecord.content === 'string') {
      const maybeAudience = extractSectionFromContent(courseRecord.content, /(who should join|who is this course for)/i);
      if (maybeAudience) {
        draft.studentProfile = maybeAudience;
      }
    }

    if (!draft.learningGoals && typeof courseRecord.content === 'string') {
      const bulletGoals = extractListItemsFromContent(courseRecord.content, /(what you will learn|you will learn|learning objectives)/i);
      if (bulletGoals.length > 0) {
        draft.learningGoals = bulletGoals;
      }
    }

    if (draft.usesCodeExamples !== true) {
      const textParts: string[] = [];
      if (draft.description) textParts.push(draft.description);
      if (draft.studentProfile) textParts.push(draft.studentProfile);
      if (draft.learningGoals) textParts.push(...draft.learningGoals);
      if (draft.courseItems) textParts.push(...draft.courseItems.map((item) => item.title));
      const combined = textParts.join(' ').toLowerCase();
      if (combined.includes('code')) {
        draft.usesCodeExamples = true;
      }
    }

    return { draft, warnings };
  } catch {
    return { draft: null, warnings: ['Failed to parse Next.js course payload'] };
  }
}

function findHeroBlock(blocks: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  return blocks.find((block) => block && typeof block === 'object' && ('level' in block || 'duration' in block));
}

function findBlockByTitle(blocks: Array<Record<string, unknown>>, matcher: RegExp): (Record<string, unknown> & { title?: unknown; body?: unknown }) | undefined {
  return blocks.find((block) => {
    if (!block || typeof block !== 'object') return false;
    const title = block.title;
    return typeof title === 'string' && matcher.test(title);
  }) as (Record<string, unknown> & { title?: unknown; body?: unknown }) | undefined;
}

function getFirstString(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key as keyof typeof record];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) {
          return entry;
        }
      }
    }
  }

  return null;
}

function getFirstNumber(
  record: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = record[key as keyof typeof record];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const numeric = Number.parseFloat(value);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
  }

  return null;
}

type ExtractBlockOptions = {
  preserveLineBreaks?: boolean;
};

function extractBlockText(
  value: unknown,
  options: ExtractBlockOptions = {}
): string | null {
  const { preserveLineBreaks = false } = options;

  if (!value) return null;

  if (typeof value === "string") {
    const decoded = decodeHtmlEntities(value);
    const stripped = stripHtml(decoded, { preserveLineBreaks });
    const text = preserveLineBreaks
      ? sanitizeMultiline(stripped)
      : sanitizeText(stripped);
    return text || null;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractBlockText(item, options))
      .filter((item): item is string => Boolean(item));
    if (parts.length === 0) {
      return null;
    }
    const joined = parts.join(preserveLineBreaks ? "\n" : " ");
    const text = preserveLineBreaks
      ? sanitizeMultiline(joined)
      : sanitizeText(joined);
    return text || null;
  }

  if (typeof value === "object") {
    const node = value as Record<string, unknown>;
    if (typeof node.text === "string") {
      return extractBlockText(node.text, options);
    }
    if (typeof node.content === "string") {
      return extractBlockText(node.content, options);
    }
    if (Array.isArray(node.children)) {
      return extractBlockText(node.children, options);
    }
  }

  return null;
}

function extractSectionFromContent(
  content: string,
  matcher: RegExp
): string | null {
  const decoded = decodeHtmlEntities(content);
  const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(decoded))) {
    const heading = sanitizeText(stripHtml(match[1] ?? ""));
    if (!matcher.test(heading)) {
      continue;
    }

    const remainder = decoded.slice(headingRegex.lastIndex);
    const nextHeadingIndex = remainder.search(/<h[1-6][^>]*>/i);
    const sectionHtml =
      nextHeadingIndex === -1
        ? remainder
        : remainder.slice(0, nextHeadingIndex);
    const text = extractBlockText(sectionHtml, { preserveLineBreaks: true });
    if (text) {
      return text;
    }
  }

  return null;
}

function extractListItemsFromContent(
  content: string,
  matcher: RegExp
): string[] {
  const decoded = decodeHtmlEntities(content);
  const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const items: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(decoded))) {
    const heading = sanitizeText(stripHtml(match[1] ?? ""));
    if (!matcher.test(heading)) {
      continue;
    }

    const remainder = decoded.slice(headingRegex.lastIndex);
    const nextHeadingIndex = remainder.search(/<h[1-6][^>]*>/i);
    const sectionHtml =
      nextHeadingIndex === -1
        ? remainder
        : remainder.slice(0, nextHeadingIndex);
    const listMatches = sectionHtml.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
    if (!listMatches) {
      continue;
    }

    for (const listItem of listMatches) {
      const text = extractBlockText(listItem);
      if (text) {
        items.push(text);
      }
    }

    if (items.length > 0) {
      break;
    }
  }

  return items;
}

function parseDurationFromDisplay(value: string): number | null {
  const normalized = value.toLowerCase();
  let totalMinutes = 0;

  const hourMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(hour|hr)/);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1].replace(",", ".")) * 60;
  }

  const minuteMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(minute|min)/);
  if (minuteMatch) {
    totalMinutes += parseFloat(minuteMatch[1].replace(",", "."));
  }

  const dayMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*day/);
  if (dayMatch) {
    totalMinutes += parseFloat(dayMatch[1].replace(",", ".")) * 24 * 60;
  }

  if (totalMinutes > 0) {
    return Math.round(totalMinutes);
  }

  const numericOnly = normalized.match(/^(\d+(?:[\.,]\d+)?)$/);
  if (numericOnly) {
    return Math.round(parseFloat(numericOnly[1].replace(",", ".")));
  }

  return null;
}

function normalizeCourseSuggestions(
  suggestions: CourseFieldSuggestions,
  url: string
): { course: CourseFieldSuggestions; warnings: string[] } {
  const warnings: string[] = [];

  updateSuggestion(suggestions, "url", url, "high", "input");

  if (
    suggestions.duration.value !== null &&
    (!Number.isFinite(suggestions.duration.value) ||
      suggestions.duration.value < 0)
  ) {
    warnings.push("Duration extracted but invalid; clearing value");
    suggestions.duration = {
      value: null,
      confidence: "low",
      source: suggestions.duration.source,
    };
  }

  if (
    !suggestions.learningGoals.value ||
    suggestions.learningGoals.value.length === 0
  ) {
    suggestions.learningGoals = {
      value: [],
      confidence: "low",
      source: suggestions.learningGoals.source,
    };
    warnings.push("Learning goals not detected");
  }

  if (
    !suggestions.instructors.value ||
    suggestions.instructors.value.length === 0
  ) {
    suggestions.instructors = {
      value: [],
      confidence: "low",
      source: suggestions.instructors.source,
    };
    warnings.push("Instructors not detected");
  }

  if (
    !suggestions.courseItems.value ||
    suggestions.courseItems.value.length === 0
  ) {
    suggestions.courseItems = {
      value: [],
      confidence: "low",
      source: suggestions.courseItems.source,
    };
    warnings.push("Course outline not detected");
  }

  if (suggestions.difficulty.value === null) {
    suggestions.difficulty = {
      value: "Beginner",
      confidence: "low",
      source: suggestions.difficulty.source ?? "default",
    };
    warnings.push("Difficulty not detected; defaulted to Beginner");
  }

  if (suggestions.usesCodeExamples.value === null) {
    suggestions.usesCodeExamples = {
      value: false,
      confidence: "low",
      source: suggestions.usesCodeExamples.source ?? "default",
    };
  }

  return { course: suggestions, warnings };
}

function createEmptySuggestions(url: string): CourseFieldSuggestions {
  return {
    title: { value: null, confidence: "low" },
    description: { value: null, confidence: "low" },
    studentProfile: { value: null, confidence: "low" },
    learningGoals: { value: null, confidence: "low" },
    difficulty: { value: null, confidence: "low" },
    duration: { value: null, confidence: "low" },
    instructors: { value: null, confidence: "low" },
    courseItems: { value: null, confidence: "low" },
    usesCodeExamples: { value: null, confidence: "low" },
    url: { value: url, confidence: "high", source: "input" },
  };
}

function applyDraftToSuggestions(
  suggestions: CourseFieldSuggestions,
  draft: PartialCourseDraft,
  confidence: ConfidenceLevel,
  source: string
) {
  if (!draft) return;

  updateSuggestion(
    suggestions,
    "title",
    draft.title ?? null,
    confidence,
    source
  );
  updateSuggestion(
    suggestions,
    "description",
    draft.description ?? null,
    confidence,
    source
  );
  updateSuggestion(
    suggestions,
    "studentProfile",
    draft.studentProfile ?? null,
    confidence,
    source
  );
  updateSuggestion(
    suggestions,
    "learningGoals",
    draft.learningGoals ?? null,
    confidence,
    source
  );
  if (draft.difficulty) {
    const difficulty = normalizeDifficulty(draft.difficulty);
    updateSuggestion(
      suggestions,
      "difficulty",
      difficulty ?? null,
      confidence,
      source
    );
  }
  updateSuggestion(
    suggestions,
    "duration",
    draft.duration ?? null,
    confidence,
    source
  );
  updateSuggestion(
    suggestions,
    "instructors",
    draft.instructors ?? null,
    confidence,
    source
  );
  updateSuggestion(
    suggestions,
    "courseItems",
    draft.courseItems ?? null,
    confidence,
    source
  );
  if (typeof draft.usesCodeExamples === "boolean") {
    updateSuggestion(
      suggestions,
      "usesCodeExamples",
      draft.usesCodeExamples,
      confidence,
      source
    );
  }
  if (draft.url) {
    updateSuggestion(suggestions, "url", draft.url, confidence, source);
  }
}

function updateSuggestion<K extends keyof CourseFieldSuggestions>(
  suggestions: CourseFieldSuggestions,
  field: K,
  value: CourseFieldSuggestions[K]["value"],
  confidence: ConfidenceLevel,
  source?: string
) {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return;
  }

  const current = suggestions[field];
  const currentConfidence = current.confidence;
  const shouldReplace =
    current.value === null ||
    CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[currentConfidence];

  if (shouldReplace) {
    suggestions[field] = {
      value,
      confidence,
      source: source ?? current.source,
    } as CourseFieldSuggestions[K];
  }
}

function extractJsonLdCourses(html: string): PartialCourseDraft[] {
  const scripts = Array.from(
    html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  );
  const courses: PartialCourseDraft[] = [];

  for (const match of scripts) {
    const rawJson = match[1];
    try {
      const parsed = JSON.parse(decodeHtmlEntities(rawJson));
      collectCoursesFromJson(parsed, courses);
    } catch {
      // continue on parse errors; downstream warnings can surface in UI if needed.
      continue;
    }
  }

  return courses;
}

function collectCoursesFromJson(
  payload: unknown,
  collector: PartialCourseDraft[]
) {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectCoursesFromJson(item, collector);
    }
    return;
  }

  if (typeof payload !== "object" || payload === null) {
    return;
  }

  const node = payload as Record<string, unknown>;
  const type = node["@type"];

  const types: string[] = Array.isArray(type)
    ? type.flatMap((entry) => (typeof entry === "string" ? entry : []))
    : typeof type === "string"
    ? [type]
    : [];

  if (!types.some((t) => t.toLowerCase() === "course")) {
    // even if parent is not a Course we should inspect children
    for (const value of Object.values(node)) {
      collectCoursesFromJson(value, collector);
    }
    return;
  }

  const draft: PartialCourseDraft = {};

  if (typeof node.name === "string") {
    draft.title = sanitizeText(node.name);
  }

  if (typeof node.description === "string") {
    draft.description = sanitizeText(node.description);
  }

  if (typeof node.learningOutcome === "string") {
    draft.learningGoals = splitSentences(node.learningOutcome);
  } else if (Array.isArray(node.learningOutcome)) {
    draft.learningGoals = node.learningOutcome
      .filter((item): item is string => typeof item === "string")
      .map((item) => sanitizeText(item));
  }

  const audience = node.audience;
  if (typeof audience === "object" && audience !== null) {
    const audienceDescription = (audience as Record<string, unknown>)
      .description;
    if (typeof audienceDescription === "string") {
      draft.studentProfile = sanitizeText(audienceDescription);
    }
  }

  const level = node.educationalLevel ?? node.level;
  if (typeof level === "string") {
    const normalizedLevel = normalizeDifficulty(level);
    if (normalizedLevel) {
      draft.difficulty = normalizedLevel;
    }
  }

  const durationIso =
    typeof node.timeRequired === "string"
      ? node.timeRequired
      : typeof node.duration === "string"
      ? node.duration
      : null;
  if (durationIso) {
    const minutes = parseIsoDurationToMinutes(durationIso);
    if (minutes !== null) {
      draft.duration = minutes;
    }
  }

  const instructors = extractPersonList(
    node.instructor ?? node.creator ?? node.teacher
  );
  if (instructors.length > 0) {
    draft.instructors = instructors;
  }

  const outline = extractOutlineItems(node);
  if (outline.length > 0) {
    draft.courseItems = outline;
  }

  const keywords = node.keywords;
  if (typeof keywords === "string") {
    if (/code example/i.test(keywords)) {
      draft.usesCodeExamples = true;
    }
  } else if (Array.isArray(keywords)) {
    if (
      keywords.some(
        (item) => typeof item === "string" && /code example/i.test(item)
      )
    ) {
      draft.usesCodeExamples = true;
    }
  }

  collector.push(draft);
}

function extractPersonList(
  entry: unknown
): Array<{ name: string; title: string }> {
  if (!entry) return [];
  const items = Array.isArray(entry) ? entry : [entry];
  const result: Array<{ name: string; title: string }> = [];
  for (const item of items) {
    if (typeof item === "object" && item !== null) {
      const node = item as Record<string, unknown>;
      const name =
        typeof node.name === "string" ? sanitizeText(node.name) : null;
      if (!name) {
        continue;
      }
      const title =
        typeof node.jobTitle === "string" ? sanitizeText(node.jobTitle) : "";
      result.push({ name, title });
    }
  }
  return result;
}

function extractOutlineItems(
  node: Record<string, unknown>
): Array<{ title: string; duration: number; usesCodeExample: boolean }> {
  const outlineRaw: Array<{
    title: string;
    duration: number;
    usesCodeExample: boolean;
    position: number | null;
    order: number;
  }> = [];
  const visited = new WeakSet<Record<string, unknown>>();
  const queue: Record<string, unknown>[] = [];

  const enqueue = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) {
        enqueue(entry);
      }
      return;
    }
    if (typeof value === "object") {
      queue.push(value as Record<string, unknown>);
    }
  };

  enqueue(node.hasPart);
  enqueue(node.teaches);
  enqueue((node as { courseInstance?: unknown }).courseInstance);
  enqueue(node.hasCourseInstance);
  enqueue((node as { itemListElement?: unknown }).itemListElement);
  enqueue((node as { hasCourseWork?: unknown }).hasCourseWork);
  enqueue((node as { workExample?: unknown }).workExample);

  let order = 0;

  while (queue.length > 0) {
    const entry = queue.shift()!;
    if (visited.has(entry)) {
      continue;
    }
    visited.add(entry);

    const itemListElement = (entry as { itemListElement?: unknown })
      .itemListElement;
    if (itemListElement) {
      enqueue(itemListElement);
    }

    const item = (entry as { item?: unknown }).item;
    if (item) {
      enqueue(item);
    }

    const subHasPart = (entry as { hasPart?: unknown }).hasPart;
    if (subHasPart) {
      enqueue(subHasPart);
    }

    const title = getFirstString(entry, ["name", "headline", "title"]);
    if (!title) {
      continue;
    }

    const durationIso = getFirstString(entry, [
      "timeRequired",
      "duration",
      "typicalLearningTime",
    ]);
    let minutes = durationIso ? parseIsoDurationToMinutes(durationIso) : null;

    if (minutes === null) {
      const numericDuration = getFirstNumber(entry, [
        "timeRequired",
        "duration",
        "time",
      ]);
      if (
        typeof numericDuration === "number" &&
        Number.isFinite(numericDuration)
      ) {
        minutes =
          numericDuration > 0 && numericDuration < 10
            ? Math.round(numericDuration * 60)
            : Math.round(numericDuration);
      }
    }

    if (
      minutes === null &&
      typeof entry.index === "number" &&
      typeof entry.time === "number"
    ) {
      minutes = Math.max(0, Math.round(entry.time / 60));
    }

    const keywords = (entry as { keywords?: unknown }).keywords;
    const description = getFirstString(entry, [
      "description",
      "about",
      "summary",
    ]);
    const textForCode = [
      title,
      description || "",
      Array.isArray(keywords)
        ? keywords.join(" ")
        : typeof keywords === "string"
        ? keywords
        : "",
    ]
      .join(" ")
      .toLowerCase();
    const usesCodeExample = /code|notebook|script|demo/.test(textForCode);

    const positionValue = (entry as { position?: unknown }).position;
    const indexValue = (entry as { index?: unknown }).index;
    const position =
      typeof positionValue === "number"
        ? positionValue
        : typeof indexValue === "number"
        ? indexValue
        : null;

    outlineRaw.push({
      title: sanitizeText(title),
      duration: minutes && minutes > 0 ? minutes : 0,
      usesCodeExample,
      position,
      order: order++,
    });
  }

  if (outlineRaw.length === 0) {
    return [];
  }

  const sorted = outlineRaw.sort((a, b) => {
    if (a.position !== null && b.position !== null) {
      return a.position - b.position;
    }
    if (a.position !== null) {
      return -1;
    }
    if (b.position !== null) {
      return 1;
    }
    return a.order - b.order;
  });

  const seenTitles = new Set<string>();
  const outline: Array<{
    title: string;
    duration: number;
    usesCodeExample: boolean;
  }> = [];

  for (const item of sorted) {
    const key = item.title.toLowerCase();
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);
    outline.push({
      title: item.title,
      duration: item.duration,
      usesCodeExample: item.usesCodeExample,
    });
  }

  return outline;
}

function extractMetaDraft(html: string): PartialCourseDraft | null {
  const title = getMetaContent(html, 'property', 'og:title') ?? getMetaContent(html, 'name', 'twitter:title') ?? getDocumentTitle(html);
  const description = getMetaContent(html, 'name', 'description') ?? getMetaContent(html, 'property', 'og:description');
  const keywords = getMetaContent(html, 'name', 'keywords');

  const draft: PartialCourseDraft = {};

  if (title) {
    draft.title = title;
  }

  if (description) {
    draft.description = description;
  }

  if (keywords && /code example/i.test(keywords)) {
    draft.usesCodeExamples = true;
  }

  return Object.keys(draft).length > 0 ? draft : null;
}

function extractFromDocumentText(html: string): PartialCourseDraft | null {
  const plainText = stripHtml(html).slice(0, 5000);
  if (!plainText) return null;

  const firstSentence = plainText.split(/[.!?]\s/)[0];
  if (!firstSentence) return null;

  return {
    description: firstSentence.trim(),
  };
}

function getMetaContent(html: string, attribute: 'name' | 'property', value: string): string | null {
  const regex = new RegExp(`<meta[^>]*${attribute}=["']${escapeRegExp(value)}["'][^>]*>`, 'i');
  const match = html.match(regex);
  if (!match) return null;
  const contentMatch = match[0].match(/content=["']([^"']+)["']/i);
  if (!contentMatch) return null;
  return sanitizeText(decodeHtmlEntities(contentMatch[1]));
}

function getDocumentTitle(html: string): string | null {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  if (!match) return null;
  return sanitizeText(decodeHtmlEntities(match[1]));
}

function sanitizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeMultiline(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim());

  const normalized: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (normalized.length === 0 || normalized[normalized.length - 1] === '') {
        continue;
      }
      normalized.push('');
    } else {
      normalized.push(line);
    }
  }

  return normalized.join('\n').trim();
}

function splitSentences(value: string): string[] {
  return value
    .split(/[\.;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => sanitizeText(part));
}

function parseIsoDurationToMinutes(value: string): number | null {
  const iso = value.trim();
  const match = iso.match(/P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?/i);
  if (!match) return null;
  const [, days, hours, minutes] = match;
  const totalMinutes = (Number(days ?? 0) * 24 * 60) + (Number(hours ?? 0) * 60) + Number(minutes ?? 0);
  if (Number.isNaN(totalMinutes)) return null;
  return totalMinutes;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
    ndash: '–',
    mdash: '—',
    hellip: '…',
  };

  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec, hex, named) => {
    if (dec) {
      const codePoint = Number.parseInt(dec, 10);
      if (!Number.isNaN(codePoint)) {
        const char = String.fromCodePoint(codePoint);
        return normalizeEntityCharacter(char);
      }
      return match;
    }

    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isNaN(codePoint)) {
        const char = String.fromCodePoint(codePoint);
        return normalizeEntityCharacter(char);
      }
      return match;
    }

    if (named) {
      const replacement = namedEntities[named.toLowerCase()];
      if (replacement !== undefined) {
        return normalizeEntityCharacter(replacement);
      }
    }

    return match;
  });
}

function normalizeEntityCharacter(char: string): string {
  switch (char) {
    case '\u00A0':
    case '\u2009':
    case '\u200A':
    case '\u202F':
      return ' ';
    case '\u2019':
    case '\u2018':
    case '\u2032':
      return "'";
    case '\u201C':
    case '\u201D':
    case '\u2033':
      return '"';
    default:
      return char;
  }
}

type StripHtmlOptions = {
  preserveLineBreaks?: boolean;
};

function stripHtml(html: string, options: StripHtmlOptions = {}): string {
  const { preserveLineBreaks = false } = options;

  let value = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  if (preserveLineBreaks) {
    value = value
      .replace(/<(br|BR)\s*\/?\s*>/g, '\n')
      .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6])\s*>/gi, '\n')
      .replace(/<(p|div|section|article|li|ul|ol|h[1-6])[^>]*>/gi, '\n');
  }

  return value.replace(/<[^>]+>/g, preserveLineBreaks ? '' : ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDifficulty(value: string): 'Beginner' | 'Intermediate' | 'Advanced' | null {
  const normalized = value.toLowerCase();
  if (normalized.includes('beginner') || normalized.includes('intro')) return 'Beginner';
  if (normalized.includes('intermediate') || normalized.includes('intermed')) return 'Intermediate';
  if (normalized.includes('advanced') || normalized.includes('expert')) return 'Advanced';
  return null;
}

export type { CourseFieldSuggestions, CourseImportResult, ConfidenceLevel } from '@/lib/course-import/types';
export { CourseImportError } from '@/lib/course-import/types';
