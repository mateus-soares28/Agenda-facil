"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { browserStore, emptyData } from "../lib/data/browser-store";
import { createSupabaseRepository } from "../lib/data/supabase-store";
import { createClient } from "../lib/supabase/client";
import { useRouter } from "next/navigation";
import type {
  AppData,
  Invoice,
  Lesson,
  Plan,
  Student,
  StudentStatus,
} from "../lib/data/types";
import { Icon, type IconName } from "./components/icons";
import { LessonForm, StudentForm } from "./components/forms";
import { PlanForm } from "./components/plan-form";
import { Calendar, type CalendarMode } from "./components/calendar";
import { formatCurrency } from "../lib/data/format";

type View =
  | "overview"
  | "agenda"
  | "students"
  | "register"
  | "plans"
  | "finance"
  | "billing"
  | "leads"
  | "settings";
const nav: { view: View; label: string; icon: IconName }[] = [
  { view: "overview", label: "Visão geral", icon: "grid" },
  { view: "agenda", label: "Agenda", icon: "calendar" },
  { view: "students", label: "Alunos", icon: "users" },
  { view: "register", label: "Cadastro", icon: "plus" },
  { view: "plans", label: "Planos", icon: "layers" },
  { view: "finance", label: "Financeiro", icon: "wallet" },
  { view: "billing", label: "Cobranças", icon: "message" },
  { view: "leads", label: "Interessados", icon: "target" },
];
const viewTitles: Record<View, string> = {
  overview: "Visão geral",
  agenda: "Agenda",
  students: "Alunos",
  register: "Cadastro",
  plans: "Planos",
  finance: "Financeiro",
  billing: "Cobranças",
  leads: "Interessados",
  settings: "Configurações",
};
const statusLabels: Record<StudentStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  trial: "Experimental",
};

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AppData>;
  return Array.isArray(data.students) && Array.isArray(data.lessons) &&
    Array.isArray(data.plans) && Array.isArray(data.invoices) &&
    data.students.every((student) => typeof student.id === "string" && typeof student.full_name === "string") &&
    data.lessons.every((lesson) => typeof lesson.id === "string" && Array.isArray(lesson.student_ids)) &&
    data.plans.every((plan) => typeof plan.id === "string" && typeof plan.name === "string") &&
    data.invoices.every((invoice) => typeof invoice.id === "string" && typeof invoice.student_id === "string");
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function LessonList({
  lessons,
  students,
}: {
  lessons: Lesson[];
  students: Student[];
}) {
  return (
    <div className="lesson-list">
      {lessons.map((lesson) => {
        const names = lesson.student_ids
          .map((id) => students.find((student) => student.id === id)?.full_name)
          .filter(Boolean);
        return (
          <article className="lesson-row" key={lesson.id}>
            <div className="lesson-date">
              <strong>{formatDate(lesson.class_date)}</strong>
              <span>
                {lesson.start_time} – {lesson.end_time}
              </span>
            </div>
            <div className="lesson-details">
              <strong>
                {lesson.class_type === "trial"
                  ? "Aula experimental"
                  : lesson.class_type === "drop_in"
                    ? "Aula avulsa"
                    : "Aula regular"}
              </strong>
              <span>
                {names.length ? names.join(" · ") : "Sem alunos vinculados"}
              </span>
            </div>
            <div className="lesson-meta">
              {lesson.court || "Quadra não informada"}
            </div>
            <span className="status-badge">
              {lesson.status === "completed"
                ? "Realizada"
                : lesson.status === "cancelled"
                  ? "Cancelada"
                  : "Agendada"}
            </span>
          </article>
        );
      })}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const repository = useMemo(() => createSupabaseRepository(), []);
  const [data, setData] = useState<AppData>(emptyData);
  const [migrationSource, setMigrationSource] = useState<AppData | null>(null);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [lessonSlot, setLessonSlot] = useState<{ date: string; startTime: string; endTime: string } | null>(null);
  const lessonFormRef = useRef<HTMLDivElement>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [calendarDate, setCalendarDate] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [today, setToday] = useState("");
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    if (!showLessonForm || !lessonSlot) return;
    const frame = window.requestAnimationFrame(() => {
      lessonFormRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showLessonForm, lessonSlot]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      Promise.allSettled([repository.load(), browserStore.load()]).then(([remote, local]) => {
        if (remote.status === "fulfilled") setData(remote.value);
        else {
          setLoadFailed(true);
          setStorageError(remote.reason instanceof Error ? remote.reason.message : "Não foi possível carregar os dados do Supabase.");
        }
        if (local.status === "fulfilled" &&
          (local.value.students.length || local.value.lessons.length || local.value.invoices.length ||
            local.value.plans.some((plan) => !emptyData.plans.some((item) =>
              item.id === plan.id && JSON.stringify(item) === JSON.stringify(plan),
            )))) setMigrationSource(local.value);
        setLoaded(true);
      });
      try {
        setCollapsed(
          window.localStorage.getItem("agenda-facil:sidebar-collapsed") ===
            "true",
        );
      } catch {
        /* Storage may be disabled. */
      }
      setToday(localDate());
      setCalendarDate(localDate());
      if (window.matchMedia("(max-width: 760px)").matches) setCalendarMode("day");
      setTodayLabel(
        new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "full",
          timeZone: "America/Sao_Paulo",
        }).format(new Date()),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [repository]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void repository.load().then((result) => { setData(result); setLoadFailed(false); }).catch(() =>
          setStorageError("Não foi possível sincronizar. Recarregue a página."),
        );
      }
    }
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [repository]);

  async function refreshData() {
    setData(await repository.load());
    setLoadFailed(false);
  }

  function reportMutationError(error: unknown, fallback: string) {
    setStorageError(error instanceof Error ? error.message : fallback);
    void refreshData().catch(() => setLoadFailed(true));
  }

  function syncAfterMutation() {
    void refreshData().catch(() =>
      setStorageError("Alteração salva, mas não foi possível atualizar a tela. Recarregue a página."),
    );
  }

  async function importLocalData(source: AppData) {
    setMigrationBusy(true);
    setMigrationMessage("");
    try {
      const result = await repository.importData(source);
      setData(result);
      setMigrationSource(null);
      setMigrationMessage("Importação concluída. Backup local preservado neste navegador.");
      setStorageError("");
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "Não foi possível importar o backup.");
    } finally {
      setMigrationBusy(false);
    }
  }

  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) setStorageError("Não foi possível sair. Tente novamente.");
    else {
      router.replace("/login");
      router.refresh();
    }
  }

  function createOpenInvoice(student: Student): Invoice | undefined {
    const plan = data.plans.find((item) => item.id === student.plan_id);
    if (!plan) return undefined;
    const quantity =
      plan.kind === "monthly" ? (student.monthly_class_limit ?? 1) : 1;
    const participantCount =
      plan.price_unit === "per_class" ? (plan.group_size ?? 1) : 1;
    return {
      id: crypto.randomUUID(),
      student_id: student.id,
      student_name: student.full_name,
      plan_name: plan.name,
      amount_cents: Math.round(
        (plan.price_cents * quantity) / participantCount,
      ),
      reference_month: localDate().slice(0, 7),
      status: "open",
      created_at: new Date().toISOString(),
    };
  }
  async function persistStudent(student: Student) {
    try {
      const invoice = createOpenInvoice(student);
      await repository.createStudent(student, invoice);
      setData((current) => ({
        ...current,
        students: [...current.students, student],
        invoices: invoice ? [...current.invoices, invoice] : current.invoices,
      }));
      setStorageError("");
      syncAfterMutation();
      return true;
    } catch (error) {
      reportMutationError(error, "Não foi possível salvar no Supabase. Tente novamente.");
      return false;
    }
  }
  async function updateStudent(student: Student) {
    try {
      const planChanged =
        student.plan_id !== editingStudent?.plan_id ||
        student.monthly_class_limit !== editingStudent?.monthly_class_limit;
      const invoice = planChanged ? createOpenInvoice(student) : undefined;
      await repository.updateStudent(student, invoice);
      setData((current) => ({
        ...current,
        students: current.students.map((item) =>
          item.id === student.id ? student : item,
        ),
        invoices: invoice ? [...current.invoices, invoice] : current.invoices,
      }));
      setStorageError("");
      syncAfterMutation();
      return true;
    } catch (error) {
      reportMutationError(error, "Não foi possível atualizar o aluno no Supabase.");
      return false;
    }
  }
  async function removeStudent(student: Student) {
    if (
      !window.confirm(
        `Remover ${student.full_name}? Aluno sai das aulas futuras; histórico e financeiro ficam preservados. Confirmar?`,
      )
    )
      return;
    try {
      await repository.deleteStudent(student.id);
      const archivedAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        students: current.students.map((item) =>
          item.id === student.id ? { ...item, archived_at: archivedAt } : item,
        ),
        lessons: current.lessons.flatMap((lesson) => {
          if (
            lesson.status !== "scheduled" ||
            !lesson.student_ids.includes(student.id)
          )
            return [lesson];
          const studentIds = lesson.student_ids.filter(
            (id) => id !== student.id,
          );
          if (!studentIds.length) return [];
          const checkedIn = (lesson.checked_in_student_ids ?? []).filter(
            (id) => id !== student.id,
          );
          const status: Lesson["status"] = studentIds.every((id) =>
            checkedIn.includes(id),
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
      setStorageError("");
      syncAfterMutation();
    } catch (error) {
      reportMutationError(error, "Não foi possível remover o aluno no Supabase.");
    }
  }
  async function persistLessons(lessons: Lesson[]) {
    const reservations = [...data.lessons, ...lessons];
    const hasConflict = lessons.some((lesson) => reservations.some((item) =>
      item.id !== lesson.id && item.status === "scheduled" &&
      item.class_date === lesson.class_date &&
      item.court.trim().toLocaleLowerCase("pt-BR") === lesson.court.trim().toLocaleLowerCase("pt-BR") &&
      item.start_time < lesson.end_time && item.end_time > lesson.start_time,
    ));
    if (hasConflict) {
      setStorageError("Esse horário da quadra já está reservado. Escolha outra quadra ou horário.");
      return false;
    }
    try {
      await repository.createLessons(lessons);
      setData((current) => ({ ...current, lessons: [...current.lessons, ...lessons] }));
      setStorageError("");
      syncAfterMutation();
      return true;
    } catch (error) {
      reportMutationError(error, "Não foi possível salvar no Supabase. Tente novamente.");
      return false;
    }
  }
  async function updateLesson(lesson: Lesson) {
    try {
      await repository.updateLesson(lesson);
      setData((current) => ({
        ...current,
        lessons: current.lessons.map((item) =>
          item.id === lesson.id ? lesson : item,
        ),
      }));
      setStorageError("");
      syncAfterMutation();
      return true;
    } catch (error) {
      reportMutationError(error, "Não foi possível atualizar a aula no Supabase.");
      return false;
    }
  }
  async function deleteLesson(id: string) {
    try {
      await repository.deleteLesson(id);
      setData((current) => ({
        ...current,
        lessons: current.lessons.filter((item) => item.id !== id),
      }));
      setStorageError("");
      syncAfterMutation();
      return true;
    } catch (error) {
      reportMutationError(error, "Não foi possível remover a aula no Supabase.");
      return false;
    }
  }
  async function checkInClass(lesson: Lesson) {
    if (!lesson.student_ids.length || lesson.status !== "scheduled") return;
    const month = lesson.class_date.slice(0, 7);
    const hasExhaustedPlan = lesson.student_ids.some((studentId) => {
      const student = data.students.find((item) => item.id === studentId);
      const plan = data.plans.find((item) => item.id === student?.plan_id);
      if (!student || plan?.kind !== "monthly" || !student.monthly_class_limit) return false;
      const used = data.lessons.filter((item) =>
        item.class_date.startsWith(month) &&
        (item.checked_in_student_ids ?? []).includes(studentId),
      ).length;
      return used >= student.monthly_class_limit;
    });
    if (hasExhaustedPlan) {
      setStorageError("Um ou mais alunos já usaram as aulas disponíveis no plano deste mês.");
      return;
    }
    await updateLesson({ ...lesson, checked_in_student_ids: [...lesson.student_ids], status: "completed" });
  }
  async function addStudentToLesson(lesson: Lesson, studentId: string, planId: string, monthlyLimit: number) {
    if (lesson.status !== "scheduled" || lesson.student_ids.includes(studentId)) return;
    const student = data.students.find((item) => item.id === studentId && !item.archived_at);
    const plan = data.plans.find((item) => item.id === planId && item.active);
    if (!student || !plan) return;
    const classSeries = lesson.series_id
      ? data.lessons.filter((item) => item.series_id === lesson.series_id && item.status === "scheduled" && item.class_date >= lesson.class_date)
      : [lesson];
    const targetLessons = classSeries.filter((item) => !item.student_ids.includes(studentId));
    if (targetLessons.some((item) => item.student_ids.length >= 4)) {
      setStorageError("A turma aceita at\u00e9 quatro alunos. Uma das aulas futuras j\u00e1 est\u00e1 completa.");
      return;
    }
    if (plan.kind === "monthly" && (!Number.isInteger(monthlyLimit) || monthlyLimit < 1 || monthlyLimit > 31)) {
      setStorageError("Informe de 1 a 31 aulas mensais para este plano.");
      return;
    }
    try {
      const updatedStudent: Student = { ...student, plan_id: plan.id, monthly_class_limit: plan.kind === "monthly" ? monthlyLimit : 1 };
      const changed = student.plan_id !== updatedStudent.plan_id || student.monthly_class_limit !== updatedStudent.monthly_class_limit;
      const invoice = changed ? createOpenInvoice(updatedStudent) : undefined;
      if (changed) await repository.updateStudent(updatedStudent, invoice);
      const updatedLessons = targetLessons.map((item) => ({ ...item, student_ids: [...item.student_ids, studentId] }));
      if (updatedLessons.length === 1) await repository.updateLesson(updatedLessons[0]);
      else if (updatedLessons.length) await repository.updateLessons(updatedLessons);
      setData((current) => ({
        ...current,
        students: changed ? current.students.map((item) => item.id === studentId ? updatedStudent : item) : current.students,
        invoices: invoice ? [...current.invoices, invoice] : current.invoices,
        lessons: current.lessons.map((item) => updatedLessons.find((updated) => updated.id === item.id) ?? item),
      }));
      setStorageError("");
      syncAfterMutation();
    } catch (error) {
      reportMutationError(error, "Não foi possível adicionar o aluno ao horário recorrente.");
    }
  }
  async function removeStudentFromLesson(lesson: Lesson, studentId: string) {
    const student = data.students.find((item) => item.id === studentId);
    if (
      !window.confirm(
        `Remover ${student?.full_name ?? "aluno"} desta aula? Outros alunos e cobranças ficam preservados.`,
      )
    )
      return;
    const studentIds = lesson.student_ids.filter((id) => id !== studentId);
    if (!studentIds.length) {
      await deleteLesson(lesson.id);
      return;
    }
    const checkedIn = (lesson.checked_in_student_ids ?? []).filter(
      (id) => id !== studentId,
    );
    await updateLesson({
      ...lesson,
      student_ids: studentIds,
      checked_in_student_ids: checkedIn,
      status: studentIds.every((id) => checkedIn.includes(id))
        ? "completed"
        : "scheduled",
    });
  }
  async function rescheduleStudent(
    lesson: Lesson,
    studentId: string,
    slot: {
      class_date: string;
      start_time: string;
      end_time: string;
      court: string;
    },
  ) {
    if (slot.court) {
      const overlappingCount = data.lessons
        .filter(
          (item) =>
            item.id !== lesson.id &&
            item.status === "scheduled" &&
            item.class_date === slot.class_date &&
            item.court.toLocaleLowerCase("pt-BR") ===
              slot.court.toLocaleLowerCase("pt-BR") &&
            item.start_time < slot.end_time &&
            item.end_time > slot.start_time,
        )
        .reduce((total, item) => total + item.student_ids.length, 0);
      if (overlappingCount >= 4) {
        setStorageError(
          "Essa quadra já tem 4 alunos nesse horário. Escolha outro horário ou quadra.",
        );
        return;
      }
    }
    const destination: Lesson = {
      ...lesson,
      ...slot,
      id: crypto.randomUUID(),
      status: "scheduled",
      student_ids: [studentId],
      checked_in_student_ids: [],
      created_at: new Date().toISOString(),
    };
    try {
      await repository.rescheduleStudent(lesson, destination, studentId);
      const remaining = lesson.student_ids.filter((id) => id !== studentId);
      setData((current) => ({
        ...current,
        lessons: [
          ...current.lessons.flatMap((item) => {
            if (item.id !== lesson.id) return [item];
            if (!remaining.length) return [];
            const checkedIn = (lesson.checked_in_student_ids ?? []).filter(
              (id) => id !== studentId,
            );
            const status: Lesson["status"] = remaining.every((id) =>
              checkedIn.includes(id),
            )
              ? "completed"
              : "scheduled";
            return [
              {
                ...lesson,
                student_ids: remaining,
                checked_in_student_ids: checkedIn,
                status,
              },
            ];
          }),
          destination,
        ],
      }));
      setStorageError("");
      syncAfterMutation();
    } catch (error) {
      reportMutationError(error, "Não foi possível remanejar o aluno no Supabase.");
    }
  }
  async function persistPlan(plan: Plan) {
    try {
      if (editingPlan) await repository.updatePlan(plan);
      else await repository.createPlan(plan);
      setData((current) => ({
        ...current,
        plans: editingPlan
          ? current.plans.map((item) => (item.id === plan.id ? plan : item))
          : [...current.plans, plan],
      }));
      setShowPlanForm(false);
      setEditingPlan(null);
      setStorageError("");
      syncAfterMutation();
    } catch (error) {
      reportMutationError(error, "Não foi possível salvar o plano no Supabase.");
    }
  }
  function go(next: View) {
    setView(next);
    setShowLessonForm(false);
    setLessonSlot(null);
    setShowPlanForm(false);
    setEditingStudent(null);
    setEditingPlan(null);
    setMobileOpen(false);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(
        "agenda-facil:sidebar-collapsed",
        String(next),
      );
    } catch {
      /* Layout still works. */
    }
  }
  function downloadBackup(source: AppData, name: string) {
    const blob = new Blob([JSON.stringify(source, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportData() {
    downloadBackup(data, `agenda-facil-${today}.json`);
  }

  async function chooseBackup(file?: File) {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isAppData(parsed)) throw new Error("Arquivo não contém um backup válido do Agenda Fácil.");
      setMigrationSource(parsed);
      setMigrationMessage("Backup pronto para importar. Confira os totais antes de continuar.");
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  const activeStudents = useMemo(
    () => data.students.filter((student) => !student.archived_at),
    [data.students],
  );
  const sortedStudents = useMemo(
    () =>
      [...activeStudents].sort((a, b) =>
        a.full_name.localeCompare(b.full_name, "pt-BR"),
      ),
    [activeStudents],
  );
  const filteredStudents = useMemo(
    () =>
      sortedStudents.filter((student) =>
        `${student.full_name} ${student.email} ${student.phone}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
      ),
    [sortedStudents, query],
  );
  const todayLessons = useMemo(
    () =>
      data.lessons
        .filter(
          (lesson) =>
            lesson.class_date === today && lesson.status !== "cancelled",
        )
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [data.lessons, today],
  );
  const allLessons = useMemo(
    () =>
      [...data.lessons].sort((a, b) =>
        `${a.class_date}${a.start_time}`.localeCompare(
          `${b.class_date}${b.start_time}`,
        ),
      ),
    [data.lessons],
  );
  const activeCount = activeStudents.filter(
    (student) => student.status === "active",
  ).length;
  const scheduledCount = data.lessons.filter(
    (lesson) => lesson.status === "scheduled",
  ).length;
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status === "open",
  );
  const openBalance = openInvoices.reduce(
    (total, invoice) => total + invoice.amount_cents,
    0,
  );

  return (
    <div
      className={`app-shell${collapsed ? " is-collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
    >
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-head">
          <button
            className="brand"
            type="button"
            onClick={() => go("overview")}
            aria-label="Agenda Fácil, visão geral"
          >
            <span className="brand-mark">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="brand-name">
              agenda<span>fácil</span>
            </span>
          </button>
          <button
            className="collapse-button"
            type="button"
            onClick={toggleSidebar}
            aria-label={
              collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
            }
            title={
              collapsed ? "Expandir barra lateral" : "Recolher barra lateral"
            }
          >
            <Icon name="panel" />
          </button>
          <button
            className="mobile-close"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">AF</span>
          <span className="workspace-copy">
            <strong>Meu espaço</strong>
            <small>Área do professor</small>
          </span>
        </div>
        <nav className="side-nav">
          <p className="nav-label">MENU</p>
          {nav.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => go(item.view)}
              className={`nav-link${view === item.view ? " is-active" : ""}`}
              aria-current={view === item.view ? "page" : undefined}
              title={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`nav-link${view === "settings" ? " is-active" : ""}`}
            onClick={() => go("settings")}
            title="Configurações"
          >
            <Icon name="settings" />
            <span>Configurações</span>
          </button>
          <div className="profile-row">
            <span className="profile-avatar">AF</span>
            <span className="profile-copy">
              <strong>Área do professor</strong>
              <small>Dados sincronizados</small>
            </span>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Icon name="panel" />
          </button>
          <div className="breadcrumbs">
            <span>Agenda Fácil</span>
            <Icon name="chevron" size={14} />
            <strong>{viewTitles[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="storage-pill">
              <span /> Supabase
            </span>
            <button className="sign-out-button" type="button" onClick={signOut}>Sair</button>
            <button
              className="top-action"
              type="button"
              onClick={() => go("register")}
            >
              <Icon name="plus" size={17} />
              <span>Novo aluno</span>
            </button>
          </div>
        </header>
        <main className="page-content">
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
            </div>
          )}
          {!loaded ? (
            <div className="loading-state" role="status">
              Carregando dados...
            </div>
          ) : loadFailed ? (
            <div className="loading-state" role="alert">
              <p>Não foi possível carregar sua agenda.</p>
              <button className="primary-button" type="button" onClick={() => {
                void refreshData().then(() => setStorageError("")).catch((error) =>
                  setStorageError(error instanceof Error ? error.message : "Tente novamente."),
                );
              }}>Tentar novamente</button>
            </div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <section className="page-heading welcome">
                    <div>
                      <p className="eyebrow">{todayLabel}</p>
                      <h1>Visão geral</h1>
                      <p>Seu dia de aulas, em um só lugar.</p>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setView("agenda");
                        setShowLessonForm(true);
                      }}
                    >
                      <Icon name="plus" size={18} /> Nova aula
                    </button>
                  </section>
                  <section
                    className="stats-grid"
                    aria-label="Resumo da operação"
                  >
                    <article className="stat-card">
                      <span>Aulas hoje</span>
                      <strong>{todayLessons.length}</strong>
                      <small>Na agenda de hoje</small>
                    </article>
                    <article className="stat-card">
                      <span>Alunos ativos</span>
                      <strong>{activeCount}</strong>
                      <small>{activeStudents.length} no cadastro</small>
                    </article>
                    <article className="stat-card">
                      <span>Aulas agendadas</span>
                      <strong>{scheduledCount}</strong>
                      <small>Todos os dias</small>
                    </article>
                  </section>
                  <section className="content-panel">
                    <div className="section-heading">
                      <div>
                        <h2>Agenda de hoje</h2>
                        <p>Horários registrados para esta data.</p>
                      </div>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => go("agenda")}
                      >
                        Ver agenda <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    {todayLessons.length ? (
                      <LessonList
                        lessons={todayLessons}
                        students={activeStudents}
                      />
                    ) : (
                      <EmptyState
                        icon="calendar"
                        title="Nenhuma aula para hoje"
                        description="Adicione uma aula para começar a organizar seus horários."
                        action={
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              setView("agenda");
                              setShowLessonForm(true);
                            }}
                          >
                            Criar aula
                          </button>
                        }
                      />
                    )}
                  </section>
                  <section className="content-panel overview-students">
                    <div className="section-heading">
                      <div>
                        <h2>Alunos</h2>
                        <p>Seu cadastro, sempre à mão.</p>
                      </div>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => go("students")}
                      >
                        Ver alunos <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    {sortedStudents.length ? (
                      <div className="student-preview">
                        {sortedStudents.slice(0, 4).map((student) => (
                          <div className="preview-row" key={student.id}>
                            <span className="student-avatar">
                              {initials(student.full_name)}
                            </span>
                            <strong>{student.full_name}</strong>
                            <span className="status-badge">
                              {statusLabels[student.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon="users"
                        title="Nenhum aluno cadastrado"
                        description="Cadastre o primeiro aluno para criar sua lista."
                        action={
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => go("register")}
                          >
                            Cadastrar aluno
                          </button>
                        }
                      />
                    )}
                  </section>
                  <section className="content-panel finance-overview">
                    <div className="section-heading">
                      <div>
                        <h2>Resumo financeiro</h2>
                        <p>Receitas e cobranças do mês.</p>
                      </div>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => go("finance")}
                      >
                        Ver financeiro <Icon name="arrow" size={16} />
                      </button>
                    </div>
                    <div className="finance-metrics">
                      <div>
                        <span>Recebido</span>
                        <strong>—</strong>
                      </div>
                      <div>
                        <span>Em aberto</span>
                        <strong>{formatCurrency(openBalance)}</strong>
                      </div>
                      <div>
                        <span>Pagamentos registrados</span>
                        <strong>{openInvoices.length}</strong>
                      </div>
                    </div>
                    <p className="finance-note">
                      {openInvoices.length
                        ? `${openInvoices.length} cobrança(s) em aberto.`
                        : "Sem lançamentos financeiros em aberto."}
                    </p>
                  </section>
                </>
              )}
              {view === "students" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Cadastro</p>
                      <h1>Alunos</h1>
                      <p>Todos os alunos da sua conta.</p>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => go("register")}
                    >
                      <Icon name="plus" size={18} /> Cadastrar aluno
                    </button>
                  </section>
                  <div className="list-toolbar">
                    <label className="search-field">
                      <Icon name="search" size={18} />
                      <span className="sr-only">Buscar aluno</span>
                      <input
                        type="search"
                        placeholder="Buscar por nome, telefone ou e-mail"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </label>
                    <span>
                      {filteredStudents.length}{" "}
                      {filteredStudents.length === 1 ? "aluno" : "alunos"}
                    </span>
                  </div>
                  <section className="content-panel student-panel">
                    {filteredStudents.length ? (
                      <div className="students-table-wrap">
                        <table className="students-table">
                          <thead>
                            <tr>
                              <th>Aluno</th>
                              <th>Contato</th>
                              <th>Nível</th>
                              <th>Situação</th>
                              <th>Cadastro</th>
                              <th>
                                <span className="sr-only">Ações</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStudents.map((student) => (
                              <tr key={student.id}>
                                <td>
                                  <span className="student-name">
                                    <span className="student-avatar">
                                      {initials(student.full_name)}
                                    </span>
                                    <strong>{student.full_name}</strong>
                                  </span>
                                </td>
                                <td>
                                  <span className="contact-cell">
                                    {student.phone ||
                                      student.email ||
                                      "Não informado"}
                                  </span>
                                </td>
                                <td>
                                  {student.padel_level || "Não informado"}
                                </td>
                                <td>
                                  <span className="status-badge">
                                    {statusLabels[student.status]}
                                  </span>
                                </td>
                                <td>
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    timeZone: "America/Sao_Paulo",
                                  }).format(new Date(student.created_at))}
                                </td>
                                <td>
                                  <details className="student-actions">
                                    <summary
                                      aria-label={`Ações de ${student.full_name}`}
                                    >
                                      <Icon name="more" size={19} />
                                    </summary>
                                    <div className="action-menu">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingStudent(student);
                                          setView("register");
                                          window.scrollTo({
                                            top: 0,
                                            behavior: "smooth",
                                          });
                                        }}
                                      >
                                        Editar
                                      </button>
                                      <button
                                        type="button"
                                        className="danger-action"
                                        onClick={() => removeStudent(student)}
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  </details>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState
                        icon="users"
                        title={
                          query ? "Nenhum resultado" : "Nenhum aluno cadastrado"
                        }
                        description={
                          query
                            ? "Tente outro nome, telefone ou e-mail."
                            : "Use Cadastro para adicionar o primeiro aluno."
                        }
                        action={
                          !query && (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => go("register")}
                            >
                              Cadastrar aluno
                            </button>
                          )
                        }
                      />
                    )}
                  </section>
                </>
              )}
              {view === "register" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Alunos</p>
                      <h1>{editingStudent ? "Editar aluno" : "Cadastro"}</h1>
                      <p>
                        {editingStudent
                          ? "Atualize os dados do aluno cadastrado."
                          : "Registre um aluno para usar seus dados na agenda."}
                      </p>
                    </div>
                  </section>
                  <StudentForm
                    key={editingStudent?.id ?? "new-student"}
                    initial={editingStudent}
                    plans={data.plans}
                    onCancel={() => go("students")}
                    onSave={async (student) => {
                      if (
                        await (editingStudent
                          ? updateStudent(student)
                          : persistStudent(student))
                      )
                        go("students");
                    }}
                  />
                </>
              )}
              {view === "agenda" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Horários</p>
                      <h1>Agenda</h1>
                      <p>Toque em um horário livre para criar uma aula. Visualize por dia, semana ou mês.</p>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setLessonSlot(null);
                        setShowLessonForm(!showLessonForm);
                      }}
                    >
                      <Icon
                        name={showLessonForm ? "close" : "plus"}
                        size={18}
                      />{" "}
                      {showLessonForm ? "Fechar" : "Nova aula"}
                    </button>
                  </section>
                  {showLessonForm && (
                    <div ref={lessonFormRef} className="lesson-form-anchor">
                      <LessonForm
                        key={lessonSlot ? `${lessonSlot.date}-${lessonSlot.startTime}` : "manual"}
                        today={lessonSlot?.date || calendarDate || today}
                        initialStartTime={lessonSlot?.startTime}
                        initialEndTime={lessonSlot?.endTime}
                        onCancel={() => {
                          setShowLessonForm(false);
                          setLessonSlot(null);
                        }}
                        onSave={async (lessons) => {
                          if (await persistLessons(lessons)) {
                            setCalendarDate(lessons[0].class_date);
                            setShowLessonForm(false);
                            setLessonSlot(null);
                          }
                        }}
                      />
                    </div>
                  )}
                  <Calendar
                    mode={calendarMode}
                    date={calendarDate || today}
                    today={today}
                    lessons={allLessons}
                    students={activeStudents}
                    plans={data.plans}
                    onCheckIn={checkInClass}
                    onAddStudent={addStudentToLesson}
                    onRemoveStudent={removeStudentFromLesson}
                    onReschedule={rescheduleStudent}
                    onModeChange={setCalendarMode}
                    onDateChange={setCalendarDate}
                    onCreateLesson={(slot) => {
                      setLessonSlot(slot);
                      setShowLessonForm(true);
                    }}
                  />
                </>
              )}
              {view === "plans" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Tabela de valores</p>
                      <h1>Planos</h1>
                      <p>
                        Preços por hora/aula das tabelas fornecidas e planos
                        criados por você.
                      </p>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setEditingPlan(null);
                        setShowPlanForm(true);
                      }}
                    >
                      <Icon name="plus" size={18} /> Novo plano
                    </button>
                  </section>
                  {showPlanForm && (
                    <PlanForm
                      key={editingPlan?.id ?? "new-plan"}
                      initial={editingPlan}
                      onCancel={() => {
                        setShowPlanForm(false);
                        setEditingPlan(null);
                      }}
                      onSave={persistPlan}
                    />
                  )}
                  {(["monthly", "drop_in", "game"] as const).map((kind) => (
                    <section className="content-panel plan-section" key={kind}>
                      <div className="section-heading">
                        <div>
                          <h2>
                            {kind === "monthly"
                              ? "Horário mensal"
                              : kind === "drop_in"
                                ? "Aulas avulsas"
                                : "Jogo aula"}
                          </h2>
                          <p>
                            {kind === "monthly"
                              ? "Valores por hora/aula para alunos com horário fixo no mês."
                              : kind === "drop_in"
                                ? "Valores por hora/aula sem horário mensal fixo."
                                : "Valores cobrados por aluno."}
                          </p>
                        </div>
                      </div>
                      <div className="plan-grid">
                        {data.plans
                          .filter((plan) => plan.kind === kind)
                          .map((plan) => (
                            <article className="plan-card" key={plan.id}>
                              <div>
                                <h3>{plan.name}</h3>
                                <span>
                                  {plan.group_size
                                    ? `${plan.group_size} ${plan.group_size === 1 ? "aluno" : "alunos"}`
                                    : "Até 4 alunos"}{" "}
                                  · {plan.duration_minutes} min
                                </span>
                              </div>
                              <strong>
                                {formatCurrency(plan.price_cents)}
                              </strong>
                              <div className="plan-card-footer">
                                <span>
                                  {plan.price_unit === "per_student"
                                    ? "por aluno"
                                    : "por aula / grupo"}
                                  {!plan.active ? " · indisponível" : ""}
                                </span>
                                <button
                                  type="button"
                                  className="text-link"
                                  onClick={() => {
                                    setEditingPlan(plan);
                                    setShowPlanForm(true);
                                    window.scrollTo({
                                      top: 0,
                                      behavior: "smooth",
                                    });
                                  }}
                                >
                                  Editar
                                </button>
                              </div>
                            </article>
                          ))}
                      </div>
                      {!data.plans.some((plan) => plan.kind === kind) && (
                        <p className="plan-empty">
                          Nenhum plano nesta categoria.
                        </p>
                      )}
                    </section>
                  ))}
                </>
              )}
              {view === "settings" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Área do professor</p>
                      <h1>Configurações</h1>
                      <p>Faça backup e importe dados antigos quando precisar.</p>
                    </div>
                  </section>
                  <section className="content-panel migration-panel">
                    <div>
                      <h2>Importar dados antigos</h2>
                      <p>Escolha um backup JSON ou use os dados encontrados neste navegador. A importação não apaga o backup local.</p>
                    </div>
                    <label className="field">
                      Arquivo de backup
                      <input type="file" accept=".json,application/json" onChange={(event) => void chooseBackup(event.target.files?.[0])} />
                    </label>
                    {migrationSource && (
                      <div className="migration-summary">
                        <p>{migrationSource.students.length} alunos · {migrationSource.lessons.length} aulas · {migrationSource.invoices.length} cobranças</p>
                        <div className="migration-actions">
                          <button className="secondary-button" type="button" onClick={() => downloadBackup(migrationSource, `agenda-facil-local-${today}.json`)}>Baixar backup antes</button>
                          <button className="primary-button" type="button" disabled={migrationBusy} onClick={() => void importLocalData(migrationSource)}>{migrationBusy ? "Importando…" : "Importar para Supabase"}</button>
                        </div>
                      </div>
                    )}
                    {migrationMessage && <p className="auth-message" role="status">{migrationMessage}</p>}
                  </section>
                  <section className="content-panel settings-panel">
                    <div>
                      <h2>Exportar dados</h2>
                      <p>
                        Baixe os dados sincronizados em JSON. O arquivo contém dados pessoais.
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={exportData}
                    >
                      Baixar JSON
                    </button>
                  </section>
                </>
              )}
              {view === "finance" && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Contas a receber</p>
                      <h1>Financeiro</h1>
                      <p>
                        Planos registrados e valores pendentes na sua conta.
                      </p>
                    </div>
                  </section>
                  <section className="content-panel finance-overview">
                    <div className="finance-metrics">
                      <div>
                        <span>Em aberto</span>
                        <strong>{formatCurrency(openBalance)}</strong>
                      </div>
                      <div>
                        <span>Cobranças</span>
                        <strong>{openInvoices.length}</strong>
                      </div>
                      <div>
                        <span>Pagamentos registrados</span>
                        <strong>0</strong>
                      </div>
                    </div>
                  </section>
                  <section className="content-panel finance-invoices">
                    <div className="section-heading">
                      <div>
                        <h2>Em aberto</h2>
                        <p>
                          Valores calculados pelo plano escolhido no cadastro.
                        </p>
                      </div>
                    </div>
                    {openInvoices.length ? (
                      openInvoices.map((invoice) => (
                        <article className="invoice-row" key={invoice.id}>
                          <div>
                            <strong>{invoice.student_name}</strong>
                            <span>
                              {invoice.plan_name} · Referência{" "}
                              {invoice.reference_month}
                            </span>
                          </div>
                          <strong>
                            {formatCurrency(invoice.amount_cents)}
                          </strong>
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        icon="wallet"
                        title="Nenhuma cobrança em aberto"
                        description="Escolha um plano no cadastro do aluno para criar cobrança pendente."
                      />
                    )}
                  </section>
                </>
              )}
              {(["billing", "leads"] as View[]).includes(view) && (
                <>
                  <section className="page-heading">
                    <div>
                      <p className="eyebrow">Área do professor</p>
                      <h1>{viewTitles[view]}</h1>
                      <p>Esta área está em desenvolvimento.</p>
                    </div>
                  </section>
                  <section className="content-panel">
                    <EmptyState
                      icon={view === "leads" ? "target" : "wallet"}
                      title="Em desenvolvimento"
                      description="Esta funcionalidade será adicionada em uma próxima etapa."
                    />
                  </section>
                </>
              )}
            </>
          )}
        </main>
        <footer className="page-footer">
          <span>Agenda Fácil</span>
          <span>
            Dados sincronizados com Supabase.
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Navegação móvel">
        {nav.slice(0, 5).map((item) => (
          <button
            key={item.view}
            type="button"
            className={view === item.view ? "is-active" : ""}
            onClick={() => go(item.view)}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.view === "overview" ? "Início" : item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
