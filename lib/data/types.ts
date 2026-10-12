export type StudentStatus = "active" | "inactive" | "trial";
export type ReservationTerm = "single" | "monthly" | "semester" | "annual";
export type Student = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  padel_level: string;
  notes: string;
  status: StudentStatus;
  created_at: string;
  plan_id?: string;
  monthly_class_limit?: number;
  archived_at?: string;
};
export type Lesson = {
  id: string;
  class_date: string;
  start_time: string;
  end_time: string;
  court: string;
  class_type: "regular" | "trial" | "drop_in";
  status: "scheduled" | "completed" | "cancelled";
  student_ids: string[];
  plan_id?: string;
  quoted_price_cents?: number;
  checked_in_student_ids?: string[];
  series_id?: string;
  reservation_term?: ReservationTerm;
  notes: string;
  created_at: string;
};
export type Invoice = {
  id: string;
  student_id: string;
  student_name: string;
  plan_name: string;
  amount_cents: number;
  reference_month: string;
  status: "open";
  created_at: string;
};
export type PlanKind = "monthly" | "drop_in" | "game";
export type Plan = {
  id: string;
  name: string;
  kind: PlanKind;
  group_size: number | null;
  price_cents: number;
  price_unit: "per_class" | "per_student";
  duration_minutes: number;
  active: boolean;
};
export type AppData = {
  students: Student[];
  lessons: Lesson[];
  plans: Plan[];
  invoices: Invoice[];
};
export type DataRepository = {
  load(): Promise<AppData>;
  createStudent(student: Student, invoice?: Invoice): Promise<void>;
  updateStudent(student: Student, invoice?: Invoice): Promise<void>;
  deleteStudent(id: string): Promise<void>;
  createLessons(lessons: Lesson[]): Promise<void>;
  updateLesson(lesson: Lesson): Promise<void>;
  updateLessons(lessons: Lesson[]): Promise<void>;
  deleteLesson(id: string): Promise<void>;
  rescheduleStudent(
    source: Lesson,
    destination: Lesson,
    studentId: string,
  ): Promise<void>;
  createPlan(plan: Plan): Promise<void>;
  updatePlan(plan: Plan): Promise<void>;
};
