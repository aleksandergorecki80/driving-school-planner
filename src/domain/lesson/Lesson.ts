interface InstructorProfile {
  id: string
  categories: string[]
}

interface StudentProfile {
  id: string
  category: string
}

export class InstructorCategoryMismatchError extends Error {
  constructor(
    readonly instructorId: string,
    readonly category: string,
  ) {
    super(`Instructor ${instructorId} does not hold category ${category}`)
  }
}

export class StudentCategoryMismatchError extends Error {
  constructor(
    readonly studentId: string,
    readonly category: string,
  ) {
    super(`Student ${studentId} is not enrolled in category ${category}`)
  }
}

export class Lesson {
  private constructor(
    readonly instructorId: string,
    readonly studentId: string,
    readonly category: string,
    readonly scheduledAt: Date,
  ) {}

  static propose(input: {
    instructor: InstructorProfile
    student: StudentProfile
    category: string
    scheduledAt: Date
  }): Lesson {
    if (!input.instructor.categories.includes(input.category)) {
      throw new InstructorCategoryMismatchError(input.instructor.id, input.category)
    }
    if (input.student.category !== input.category) {
      throw new StudentCategoryMismatchError(input.student.id, input.category)
    }
    return new Lesson(input.instructor.id, input.student.id, input.category, input.scheduledAt)
  }
}
