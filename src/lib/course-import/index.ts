import { CourseInput } from '@/lib/validation/course';
import {
  CourseFieldSuggestions,
  CourseImportError,
  CourseImportResult,
  ConfidenceLevel,
} from '@/lib/course-import/types';
import { load as loadCheerio, type CheerioAPI, type Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';

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

type CheerioSelection = Cheerio<AnyNode>;

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

  const htmlBodyExtraction = extractHtmlBodyDraft(context.html);
  if (htmlBodyExtraction.draft) {
    applyDraftToSuggestions(suggestions, htmlBodyExtraction.draft, 'medium', 'html-body');
  }
  warnings.push(...htmlBodyExtraction.warnings);

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
      const bulletGoals = extractListItemsFromContent(courseRecord.content, /(what you'll learn|what you will learn|you will learn|learning objectives)/i);
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

function extractHtmlBodyDraft(html: string): { draft: PartialCourseDraft | null; warnings: string[] } {
  const $ = loadCheerio(html);
  const draft: PartialCourseDraft = {};
  const warnings: string[] = [];

  const headingTitle = sanitizeText($('h1').first().text());
  if (headingTitle) {
    draft.title = headingTitle;
  }

  const description = extractSectionText($, /about this course/i);
  if (description) {
    draft.description = description;
  }

  const studentProfile = extractSectionText($, /(who should join|who is this course for)/i);
  if (studentProfile) {
    draft.studentProfile = studentProfile;
  }

  const learningGoals = extractSectionListItems($, '#features-grid');
  if (learningGoals.length > 0) {
    draft.learningGoals = learningGoals;
  }

  const outlineExtraction = extractCourseOutlineFromRoot($);
  if (outlineExtraction.items.length > 0) {
    draft.courseItems = outlineExtraction.items;
    if (outlineExtraction.totalDuration > 0) {
      draft.duration = outlineExtraction.totalDuration;
    }
    if (
      outlineExtraction.codeExampleCount > 0 ||
      outlineExtraction.items.some((item) => item.usesCodeExample)
    ) {
      draft.usesCodeExamples = true;
    }
  }

  const instructors = extractInstructorsFromRoot($);
  if (instructors.length > 0) {
    draft.instructors = instructors;
  }

  if (Object.keys(draft).length === 0) {
    return { draft: null, warnings };
  }

  return { draft, warnings };
}

function extractCourseOutlineFromRoot(
  $: CheerioAPI
): {
  items: Array<{ title: string; duration: number; usesCodeExample: boolean }>;
  codeExampleCount: number;
  totalDuration: number;
} {
  const items: Array<{ title: string; duration: number; usesCodeExample: boolean }> = [];
  let codeExampleCount = 0;

  const anchor = $('#course-outline');
  if (!anchor.length) {
    return { items, codeExampleCount, totalDuration: 0 };
  }

  const followingDivs = anchor.nextAll('div');

  const summaryContainer = followingDivs
    .filter((_, el) => {
      const heading = $(el).find('h2').first();
      return heading.length > 0 && /course outline/i.test(heading.text());
    })
    .first();

  if (summaryContainer.length) {
    const summaryText = sanitizeText(summaryContainer.text());
    const codeMatch = summaryText.match(/(\d+)\s*Code\s*Examples/i);
    if (codeMatch) {
      codeExampleCount = Number.parseInt(codeMatch[1], 10);
    }
  }

  const lessonsContainer = followingDivs
    .filter((_, el) => $(el).find('ul[data-sentry-component="Lessons"]').length > 0)
    .first();

  if (!lessonsContainer.length) {
    return { items, codeExampleCount, totalDuration: 0 };
  }

  const lessonsList = lessonsContainer
    .find('ul[data-sentry-component="Lessons"]').first();

  lessonsList
    .children('li')
    .each((_, li) => {
      const element = $(li);
      const title = sanitizeText(
        element.find('p.text-base').first().text() || element.find('p').first().text()
      );
      if (!title) {
        return;
      }

      const detailText = sanitizeText(element.find('p.text-sm').first().text());
      let duration = parseDurationFromDisplay(detailText);
      if (duration === null) {
        duration = parseDurationFromDisplay(sanitizeText(element.text()));
      }

      const usesCodeExample = /code|notebook|script|demo/i.test(detailText);

      items.push({
        title,
        duration: duration && duration > 0 ? duration : 0,
        usesCodeExample,
      });
    });

  const totalDuration = items.reduce((acc, item) => acc + item.duration, 0);

  return { items, codeExampleCount, totalDuration };
}

function extractInstructorsFromRoot(
  $: CheerioAPI
): Array<{ name: string; title: string }> {
  const anchor = $('#instructors');
  if (!anchor.length) {
    return [];
  }

  const heading = anchor
    .nextAll('h2')
    .filter((_, el) => /instructor/i.test($(el).text()))
    .first();

  if (!heading.length) {
    return [];
  }

  let cardsContainer = heading.next();
  while (cardsContainer.length && cardsContainer[0].type !== 'tag') {
    cardsContainer = cardsContainer.next();
  }

  if (!cardsContainer.length) {
    return [];
  }

  const instructors: Array<{ name: string; title: string }> = [];

  cardsContainer
    .find('div')
    .filter((_, el) => $(el).find('h3').length > 0)
    .each((_, card) => {
      const cardEl = $(card);
      const name = sanitizeText(cardEl.find('h3').first().text());
      if (!name) {
        return;
      }
      const title = sanitizeText(cardEl.find('#instructor-title').first().text()) || 'Instructor';
      instructors.push({ name, title });
    });

  return instructors;
}

function extractSectionText(
  $: CheerioAPI,
  matcher: RegExp
): string | null {
  const container = findSectionContainer($, matcher);
  if (!container || !container.length) {
    return null;
  }

  return collectTextFromContainer($, container);
}

function extractSectionListItems(
  $: CheerioAPI,
  matcher: string
): string[] {
  const container = findSectionContainer($, matcher);
  if (!container || !container.length) {
    return [];
  }

  const items: string[] = [];
  container
    .find('li')
    .each((_, li) => {
      const text = sanitizeText($(li).text());
      if (text) {
        items.push(text);
      }
    });

  return items;
}

function findSectionContainer(
  $: CheerioAPI,
  matcher: RegExp | string
): CheerioSelection | null {
  if (typeof matcher === 'string') {
    const matchingNode = $(matcher).first();
    return matchingNode.length ? matchingNode as CheerioSelection : null;
  }

  const heading = $('h2')
    .filter((_, el) => matcher.test($(el).text().trim()))
    .first();

  if (!heading.length) {
    return null;
  }

  const proseSibling = heading.nextAll('.prose').first();
  if (proseSibling.length) {
    return proseSibling as CheerioSelection;
  }

  const sectionCard = heading.closest('div');
  if (sectionCard.length) {
    const nestedProse = sectionCard.find('.prose').first();
    if (nestedProse.length) {
      return nestedProse as CheerioSelection;
    }
  }

  const nextElement = heading
    .nextAll()
    .filter((_, el) => el.type === 'tag')
    .first();
  if (nextElement.length) {
    return nextElement as CheerioSelection;
  }

  return heading.parent() as CheerioSelection;
}

function collectTextFromContainer(
  $: CheerioAPI,
  container: CheerioSelection | null
): string | null {
  if (!container || !container.length) {
    return null;
  }

  const paragraphs: string[] = [];
  container
    .find('p,li')
    .toArray()
    .forEach((el) => {
      const text = sanitizeText($(el).text());
      if (text) {
        paragraphs.push(text);
      }
    });

  if (paragraphs.length > 0) {
    return sanitizeMultiline(paragraphs.join('\n\n'));
  }

  const text = sanitizeMultiline(container.text());
  return text || null;
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
  const $ = loadCheerio(content);
  const container = findSectionContainer($, matcher);
  if (!container || !container.length) {
    return null;
  }
  return collectTextFromContainer($, container);
}

function extractListItemsFromContent(
  content: string,
  matcher: RegExp
): string[] {
  const $ = loadCheerio(content);
  const container = findSectionContainer($, matcher);
  if (!container || !container.length) {
    return [];
  }

  const items: string[] = [];
  container
    .find('li')
    .each((_, li) => {
      const text = sanitizeText($(li).text());
      if (text) {
        items.push(text);
      }
    });

  return items;
}

function parseDurationFromDisplay(value: string): number | null {
  const normalized = value.toLowerCase();
  let totalMinutes = 0;

  const hourMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(hours?|hrs?)/);
  if (hourMatch) {
    totalMinutes += parseFloat(hourMatch[1].replace(",", ".")) * 60;
  }

  const minuteMatch = normalized.match(/(\d+(?:[\.,]\d+)?)\s*(minutes?|mins?)/);
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

  const courseItems = suggestions.courseItems.value;
  if (courseItems && courseItems.length > 0) {
    const totalDuration = courseItems.reduce((acc, item) => {
      const duration = Number.isFinite(item.duration) ? item.duration : 0;
      return acc + Math.max(0, duration);
    }, 0);

    if (totalDuration > 0) {
      updateSuggestion(suggestions, "duration", totalDuration, "high", "course-items");
    }
  }

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
    CONFIDENCE_ORDER[confidence] > CONFIDENCE_ORDER[currentConfidence];

  if (shouldReplace) {
    suggestions[field] = {
      value,
      confidence,
      source: source ?? current.source,
    } as CourseFieldSuggestions[K];
  }
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
