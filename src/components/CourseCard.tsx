import { useState, forwardRef, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, BookOpen, Clock, Code } from 'lucide-react';
import { IBaseCourse } from '@/lib/models/Course';
import { formatDuration } from '@/lib/utils/format';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CourseCardProps {
  course: IBaseCourse & { _id: string };
  isFirstResult?: boolean;
}

export const CourseCard = forwardRef<HTMLDivElement, CourseCardProps>(({ course, isFirstResult }, ref) => {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isLearningGoalsOpen, setIsLearningGoalsOpen] = useState(false);
  const [isCourseItemsOpen, setIsCourseItemsOpen] = useState(false);
  const [isInstructorsOpen, setIsInstructorsOpen] = useState(false);
  const [isDescriptionLong, setIsDescriptionLong] = useState(false);
  
  // Create a ref for the description paragraph to check its height
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  
  // Check if description is longer than 6 lines
  useEffect(() => {
    if (descriptionRef.current) {
      // Approximate line height is 1.5rem (24px)
      const lineHeight = 24;
      const sixLinesHeight = lineHeight * 6;
      setIsDescriptionLong(descriptionRef.current.scrollHeight > sixLinesHeight);
    }
  }, []);

  // Format the duration
  const formattedDuration = formatDuration(course.duration);

  return (
    <Card
      ref={ref}
      className={isFirstResult ? 'border-primary' : ''}
    >
      <CardHeader>
        <CardTitle>{course.title}</CardTitle>
        <CardDescription>
          {course.difficulty} • {formattedDuration}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description with show more/less toggle */}
        <div>
          <p 
            ref={descriptionRef}
            className={`${!isDescriptionExpanded ? 'line-clamp-6' : ''}`}
          >
            {course.description}
          </p>
          {isDescriptionLong && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-1 h-auto p-0 text-muted-foreground"
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
            >
              {isDescriptionExpanded ? (
                <span className="flex items-center">Show less <ChevronUp className="ml-1 h-4 w-4" /></span>
              ) : (
                <span className="flex items-center">Show more <ChevronDown className="ml-1 h-4 w-4" /></span>
              )}
            </Button>
          )}
        </div>

        {/* Student Profile */}
        <div>
          <p className="text-sm text-muted-foreground mb-1">Student Profile:</p>
          <p>{course.studentProfile}</p>
        </div>

        {/* Learning Goals (collapsible) */}
        <Collapsible 
          open={isLearningGoalsOpen} 
          onOpenChange={setIsLearningGoalsOpen}
          className="border rounded-md p-2"
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer p-2 hover:bg-muted/50 rounded-md">
              <div className="flex items-center">
                <BookOpen className="h-4 w-4 mr-2" />
                <h3 className="text-sm font-medium">Learning Goals</h3>
              </div>
              <div>
                {isLearningGoalsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <ul className="list-disc pl-5 space-y-1">
              {course.learningGoals.map((goal, index) => (
                <li key={index}>{goal}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {/* Course Items (collapsible) */}
        <Collapsible 
          open={isCourseItemsOpen} 
          onOpenChange={setIsCourseItemsOpen}
          className="border rounded-md p-2"
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer p-2 hover:bg-muted/50 rounded-md">
              <div className="flex items-center">
                <BookOpen className="h-4 w-4 mr-2" />
                <h3 className="text-sm font-medium">Course Outline</h3>
              </div>
              <div>
                {isCourseItemsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <ul className="list-none space-y-3">
              {course.courseItems.map((item, index) => (
                <li key={index} className="border-b pb-2 last:border-b-0 last:pb-0">
                  <div className="flex items-start">
                    <div className="mt-0.5 mr-2 flex-shrink-0">
                      {item.usesCodeExample ? 
                        <Code className="h-4 w-4 text-primary" /> : 
                        <Clock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(item.duration)}
                        {item.usesCodeExample && ' • Includes code examples'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {/* Instructors (collapsible) */}
        <Collapsible 
          open={isInstructorsOpen} 
          onOpenChange={setIsInstructorsOpen}
          className="border rounded-md p-2"
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer p-2 hover:bg-muted/50 rounded-md">
              <div className="flex items-center">
                <BookOpen className="h-4 w-4 mr-2" />
                <h3 className="text-sm font-medium">Instructors</h3>
              </div>
              <div>
                {isInstructorsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 px-2">
            <ul className="list-disc pl-5 space-y-1">
              {course.instructors.map((instructor, index) => (
                <li key={index}>{instructor.name} ({instructor.title})</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>

        {/* View Course Button */}
        {course.url && (
          <Button asChild variant="outline" className="w-full mt-2">
            <a href={course.url} target="_blank" rel="noopener noreferrer">
              View Course
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
});

CourseCard.displayName = 'CourseCard';
