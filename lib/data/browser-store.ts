import type { AppData, DataRepository, Lesson } from "./types";
import { defaultPlans } from "./default-plans";

const STORAGE_KEY = "agenda-facil:data:v1";
export const emptyData: AppData = {
  students: [],
  lessons: [],
  plans: defaultPlans,
  invoices: [],
};

function readData(): AppData {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw)
    return {
      students: [],
      lessons: [],
      plans: [...defaultPlans],
      invoices: [],
    };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object")
    throw new Error("Invalid local data");
  const data = value as Partial<AppData>;
  if (
    !Array.isArray(data.students) ||
    !Array.isArray(data.lessons) ||
    !data.students.every(
      (student) =>
        typeof student.id === "string" && typeof student.full_name === "string",
    ) ||
    !data.lessons.every(
      (lesson) =>
        typeof lesson.id === "string" &&
        typeof lesson.class_date === "string" &&
        Array.isArray(lesson.student_ids),
    )
  )
    throw new Error("Invalid local data");
  if (
    data.plans !== undefined &&
    (!Array.isArray(data.plans) ||
      !data.plans.every(
        (plan) =>
          typeof plan.id === "string" &&
          typeof plan.name === "string" &&
          Number.isInteger(plan.price_cents),
      ))
  ) {
    throw new Error("Invalid local plans");
  }
  return {
    students: data.students,
    lessons: data.lessons,
    plans: data.plans ?? [...defaultPlans],
    invoices: Array.isArray((data as Partial<AppData>).invoices)
      ? (data as Partial<AppData>).invoices!
      : [],
  };
}

function writeData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function mutateData(update: (data: AppData) => AppData) {
  writeData(update(readData()));
}

// Replace this repository with a Supabase implementation after auth is configured.
export const browserStore: DataRepository = {
  async load() {
    return readData();
  },
  async createStudent(student, invoice) {
    mutateData((data) => ({
      ...data,
      students: [...data.students, student],
      invoices: invoice ? [...data.invoices, invoice] : data.invoices,
    }));
  },
  async updateStudent(student, invoice) {
    mutateData((data) => ({
      ...data,
      students: data.students.map((item) =>
        item.id === student.id ? student : item,
      ),
      invoices: invoice ? [...data.invoices, invoice] : data.invoices,
    }));
  },
  async deleteStudent(id) {
    mutateData((data) => ({
      ...data,
      students: data.students.map((student) =>
        student.id === id
          ? { ...student, archived_at: new Date().toISOString() }
          : student,
      ),
      lessons: data.lessons.flatMap((lesson) => {
        if (lesson.status !== "scheduled" || !lesson.student_ids.includes(id))
          return [lesson];
        const studentIds = lesson.student_ids.filter(
          (studentId) => studentId !== id,
        );
        if (!studentIds.length) return [];
        const checkedIn = (lesson.checked_in_student_ids ?? []).filter(
          (studentId) => studentId !== id,
        );
        const status: Lesson["status"] = studentIds.every((studentId) =>
          checkedIn.includes(studentId),
        )
          ? "completed"
          : "scheduled";
        return [
          {
            ...lesson,
            student_ids: studentIds,
            checked_in_student_ids: checkedIn,
            status,
          },
        ];
      }),
    }));
  },
  async createLessons(lessons) {
    mutateData((data) => ({ ...data, lessons: [...data.lessons, ...lessons] }));
  },
  async updateLesson(lesson) {
    mutateData((data) => ({
      ...data,
      lessons: data.lessons.map((item) =>
        item.id === lesson.id ? lesson : item,
      ),
    }));
  },
  async updateLessons(lessons) {
    const updated = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    mutateData((data) => ({
      ...data,
      lessons: data.lessons.map((lesson) => updated.get(lesson.id) ?? lesson),
    }));
  },
  async deleteLesson(id) {
    mutateData((data) => ({
      ...data,
      lessons: data.lessons.filter((lesson) => lesson.id !== id),
    }));
  },
  async rescheduleStudent(source, destination, studentId) {
    mutateData((data) => ({
      ...data,
      lessons: [
        ...data.lessons.flatMap((lesson) => {
          if (lesson.id !== source.id) return [lesson];
          const studentIds = lesson.student_ids.filter(
            (id) => id !== studentId,
          );
          if (!studentIds.length) return [];
          const checkedIn = (source.checked_in_student_ids ?? []).filter(
            (id) => id !== studentId,
          );
          const status: Lesson["status"] = studentIds.every((id) =>
            checkedIn.includes(id),
          )
            ? "completed"
            : "scheduled";
          return [
            {
              ...source,
              student_ids: studentIds,
              checked_in_student_ids: checkedIn,
              status,
            },
          ];
        }),
        destination,
      ],
    }));
  },
  async createPlan(plan) {
    mutateData((data) => ({ ...data, plans: [...data.plans, plan] }));
  },
  async updatePlan(plan) {
    mutateData((data) => ({
      ...data,
      plans: data.plans.map((item) => (item.id === plan.id ? plan : item)),
    }));
  },
};
