export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type FieldSuggestion<T> = {
  value: T | null;
  confidence: ConfidenceLevel;
  source?: string;
};

export type CourseFieldSuggestions = {
  title: FieldSuggestion<string>;
  description: FieldSuggestion<string>;
  studentProfile: FieldSuggestion<string>;
  learningGoals: FieldSuggestion<string[]>;
  difficulty: FieldSuggestion<'Beginner' | 'Intermediate' | 'Advanced'>;
  duration: FieldSuggestion<number>;
  instructors: FieldSuggestion<Array<{ name: string; title: string }>>;
  courseItems: FieldSuggestion<Array<{ title: string; duration: number; usesCodeExample: boolean }>>;
  usesCodeExamples: FieldSuggestion<boolean>;
  url: FieldSuggestion<string>;
};

export type CourseImportResult = {
  sourceUrl: string;
  course: CourseFieldSuggestions;
  warnings: string[];
  metadata: {
    contentType?: string | null;
    fetchedAt: string;
    timings: {
      fetchMs: number;
      extractMs: number;
      normalizeMs: number;
    };
    htmlBytes: number;
  };
  // TODO: Persist the full HTML when storage is available instead of returning only a preview.
  rawHtmlPreview?: string;
};

export class CourseImportError extends Error {
  public readonly code: 'FETCH_FAILED' | 'UNSUPPORTED_CONTENT' | 'PARSING_FAILED' | 'NORMALIZATION_FAILED';

  constructor(code: CourseImportError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'CourseImportError';
  }
}
