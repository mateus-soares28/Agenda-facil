"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import type { Lesson, Plan, Student } from "../../lib/data/types";
import { Icon } from "./icons";

export type CalendarMode = "day" | "week" | "month";
const HOUR_HEIGHT = 68;
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});
const monthFormat = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

function fromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(key: string, days: number) {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}
function startOfWeek(key: string) {
  return addDays(key, -fromKey(key).getDay());
}
function shiftMonth(key: string, amount: number) {
  const date = fromKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  const month = date.getMonth();
  date.setMonth(month + 1, 0);
  const lastDay = date.getDate();
  date.setMonth(month, Math.min(day, lastDay));
  return toKey(date);
}
function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

type PlacedLesson = {
  lesson: Lesson;
  start: number;
  end: number;
  track: number;
  tracks: number;
};
function placeLessons(lessons: Lesson[]): PlacedLesson[] {
  const sorted = [...lessons].sort(
    (a, b) => minutes(a.start_time) - minutes(b.start_time),
  );
  const groups: { lesson: Lesson; start: number; end: number }[][] = [];
  let group: { lesson: Lesson; start: number; end: number }[] = [];
  let groupEnd = -1;
  for (const lesson of sorted) {
    const start = minutes(lesson.start_time);
    const end = Math.max(start + 15, minutes(lesson.end_time));
    if (group.length && start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push({ lesson, start, end });
    groupEnd = Math.max(groupEnd, end);
  }
  if (group.length) groups.push(group);
  return groups.flatMap((items) => {
    const trackEnds: number[] = [];
    const placed = items.map((item) => {
      let track = trackEnds.findIndex((end) => end <= item.start);
      if (track < 0) track = trackEnds.length;
      trackEnds[track] = item.end;
      return { ...item, track };
    });
    return placed.map((item) => ({ ...item, tracks: trackEnds.length }));
  });
}

export function Calendar({
  mode,
  date,
  today,
  lessons,
  students,
  plans,
  onModeChange,
  onDateChange,
  onCheckIn,
  onAddStudent,
  onRemoveStudent,
  onReschedule,
}: {
  mode: CalendarMode;
  date: string;
  today: string;
  lessons: Lesson[];
  students: Student[];
  plans: Plan[];
  onModeChange: (mode: CalendarMode) => void;
  onDateChange: (date: string) => void;
  onCheckIn: (lesson: Lesson) => void;
  onAddStudent: (lesson: Lesson, studentId: string, planId: string, monthlyLimit: number) => void;
  onRemoveStudent: (lesson: Lesson, studentId: string) => void;
  onReschedule: (
    lesson: Lesson,
    studentId: string,
    slot: {
      class_date: string;
      start_time: string;
      end_time: string;
      court: string;
    },
  ) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState("");
  const [newStudentId, setNewStudentId] = useState("");
  const [newPlanId, setNewPlanId] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const selected = lessons.find((lesson) => lesson.id === selectedId);
  function selectLesson(id: string) {
    if (selectedId !== id) {
      setNewStudentId("");
      setNewPlanId("");
      setMonthlyLimit("");
      setRescheduleId(null);
      setRescheduleError("");
    }
    setSelectedId(id);
  }
  const dates =
    mode === "day"
      ? [date]
      : Array.from({ length: 7 }, (_, index) =>
          addDays(startOfWeek(date), index),
        );
  const monthStart = `${date.slice(0, 7)}-01`;
  const firstCell = startOfWeek(monthStart);
  const lastDay = toKey(
    new Date(
      fromKey(monthStart).getFullYear(),
      fromKey(monthStart).getMonth() + 1,
      0,
      12,
    ),
  );
  const monthCellCount =
    Math.ceil(
      (Math.round(
        (fromKey(lastDay).getTime() - fromKey(firstCell).getTime()) / 86400000,
      ) +
        1) /
        7,
    ) * 7;
  const monthDates = Array.from({ length: monthCellCount }, (_, index) =>
    addDays(firstCell, index),
  );
  const periodLessons =
    mode === "month"
      ? lessons.filter(
          (lesson) =>
            lesson.class_date >= monthDates[0] &&
            lesson.class_date <= monthDates.at(-1)!,
        )
      : lessons.filter((lesson) => dates.includes(lesson.class_date));
  const startHour = Math.min(
    7,
    ...periodLessons.map((lesson) =>
      Math.floor(minutes(lesson.start_time) / 60),
    ),
  );
  const endHour = Math.max(
    21,
    ...periodLessons.map((lesson) => Math.ceil(minutes(lesson.end_time) / 60)),
  );
  const hours = Array.from(
    { length: endHour - startHour },
    (_, index) => startHour + index,
  );

  function navigate(direction: number) {
    onDateChange(
      mode === "month"
        ? shiftMonth(date, direction)
        : addDays(date, direction * (mode === "week" ? 7 : 1)),
    );
    setSelectedId(null);
  }
  function namesFor(lesson: Lesson) {
    return lesson.student_ids
      .map((id) => students.find((student) => student.id === id)?.full_name)
      .filter((name): name is string => Boolean(name));
  }
  function firstNamesFor(lesson: Lesson) {
    return namesFor(lesson).map((name) => name.trim().split(/\s+/)[0]);
  }
  function remainingFor(student: Student, lesson: Lesson) {
    if (!student.plan_id || !student.monthly_class_limit) return null;
    const studentPlan = plans.find((plan) => plan.id === student.plan_id);
    if (studentPlan?.kind !== "monthly") return null;
    const month = lesson.class_date.slice(0, 7);
    const used = lessons.filter(
      (item) =>
        item.class_date.startsWith(month) &&
        item.status !== "cancelled" &&
        (item.checked_in_student_ids ?? []).includes(student.id),
    ).length;
    return Math.max(0, student.monthly_class_limit - used);
  }
  function submitReschedule(
    event: FormEvent<HTMLFormElement>,
    lesson: Lesson,
    studentId: string,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const startTime = String(values.get("start_time"));
    const endTime = String(values.get("end_time"));
    if (endTime <= startTime) {
      setRescheduleError("Término deve ser depois do início.");
      return;
    }
    onReschedule(lesson, studentId, {
      class_date: String(values.get("class_date")),
      start_time: startTime,
      end_time: endTime,
      court: String(values.get("court") ?? "").trim(),
    });
    setRescheduleId(null);
    setRescheduleError("");
    setSelectedId(null);
  }
  function planFor(lesson: Lesson) {
    return plans.find((plan) => plan.id === lesson.plan_id);
  }
  function eventTone(lesson: Lesson) {
    return `${lesson.status === "completed" ? "is-completed" : ""} ${`calendar-event--${planFor(lesson)?.kind ?? "none"}`}`;
  }
  const title =
    mode === "month"
      ? monthFormat.format(fromKey(date))
      : mode === "week"
        ? `${dayFormat.format(fromKey(dates[0]))} – ${dayFormat.format(fromKey(dates[6]))}`
        : new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(
            fromKey(date),
          );

  return (
    <section className="calendar-shell" aria-label="Calendário de aulas">
      <div className="calendar-toolbar">
        <div className="calendar-navigation">
          <button
            type="button"
            className="calendar-today"
            onClick={() => {
              onDateChange(today);
              setSelectedId(null);
            }}
          >
            Hoje
          </button>
          <button
            type="button"
            className="calendar-icon-button previous"
            aria-label="Período anterior"
            onClick={() => navigate(-1)}
          >
            <Icon name="chevron" size={18} />
          </button>
          <button
            type="button"
            className="calendar-icon-button"
            aria-label="Próximo período"
            onClick={() => navigate(1)}
          >
            <Icon name="chevron" size={18} />
          </button>
          <strong>{title}</strong>
        </div>
        <div
          className="calendar-modes"
          role="group"
          aria-label="Visualização da agenda"
        >
          {(["day", "week", "month"] as CalendarMode[]).map((item) => (
            <button
              key={item}
              type="button"
              className={mode === item ? "is-active" : ""}
              aria-pressed={mode === item}
              onClick={() => {
                onModeChange(item);
                setSelectedId(null);
              }}
            >
              {item === "day" ? "Dia" : item === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>
      {mode === "month" ? (
        <div className="month-scroll">
          <div className="month-grid">
            <div className="month-weekdays">
              {dates.map((day) => (
                <span key={day}>{weekdayFormat.format(fromKey(day))}</span>
              ))}
            </div>
            <div className="month-days">
              {monthDates.map((day) => {
                const dayLessons = lessons
                  .filter(
                    (lesson) =>
                      lesson.class_date === day &&
                      lesson.status !== "cancelled",
                  )
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div
                    className={`month-day${day.slice(0, 7) !== date.slice(0, 7) ? " is-outside" : ""}`}
                    key={day}
                  >
                    <button
                      type="button"
                      className={`month-day-number${day === today ? " is-today" : ""}`}
                      onClick={() => {
                        onDateChange(day);
                        onModeChange("day");
                      }}
                      aria-label={`Abrir dia ${dayFormat.format(fromKey(day))}`}
                    >
                      {fromKey(day).getDate()}
                    </button>
                    <div className="month-events">
                      {dayLessons.slice(0, 3).map((lesson) => (
                        <button
                          key={lesson.id}
                          type="button"
                          className={`month-event ${eventTone(lesson)}`}
                          onClick={() => selectLesson(lesson.id)}
                          title={`${lesson.start_time} ${firstNamesFor(lesson).join(", ")}`}
                        >
                          <strong>{lesson.start_time}</strong>{" "}
                          {firstNamesFor(lesson).join(", ") ||
                            planFor(lesson)?.name ||
                            "Aula"}
                        </button>
                      ))}
                      {dayLessons.length > 3 && (
                        <button
                          type="button"
                          className="more-events"
                          onClick={() => {
                            onDateChange(day);
                            onModeChange("day");
                          }}
                        >
                          + {dayLessons.length - 3} aulas
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="time-calendar-scroll">
          <div className={`time-calendar${mode === "day" ? " is-day" : ""}`}>
            <div className="time-gutter">
              <div className="time-gutter-head" />
              {hours.map((hour) => (
                <div className="time-label" key={hour}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            <div className="time-days">
              {dates.map((day) => {
                const dayLessons = lessons.filter(
                  (lesson) =>
                    lesson.class_date === day && lesson.status !== "cancelled",
                );
                return (
                  <div className="time-day" key={day}>
                    <button
                      type="button"
                      className="time-day-head"
                      onClick={() => {
                        onDateChange(day);
                        onModeChange("day");
                      }}
                    >
                      <span>{weekdayFormat.format(fromKey(day))}</span>
                      <strong className={day === today ? "is-today" : ""}>
                        {fromKey(day).getDate()}
                      </strong>
                    </button>
                    <div
                      className="time-day-body"
                      style={{ height: hours.length * HOUR_HEIGHT }}
                    >
                      {hours.map((hour) => (
                        <div
                          className="hour-rule"
                          key={hour}
                          style={{ top: (hour - startHour) * HOUR_HEIGHT }}
                        />
                      ))}
                      {placeLessons(dayLessons).map(
                        ({ lesson, start, end, track, tracks }) => {
                          const style: CSSProperties = {
                            top:
                              ((start - startHour * 60) / 60) * HOUR_HEIGHT + 2,
                            height: Math.max(
                              36,
                              ((end - start) / 60) * HOUR_HEIGHT - 3,
                            ),
                            left: `calc(${(track / tracks) * 100}% + 2px)`,
                            width: `calc(${100 / tracks}% - 4px)`,
                          };
                          return (
                            <button
                              key={lesson.id}
                              type="button"
                              className={`calendar-event ${eventTone(lesson)}`}
                              style={style}
                              onClick={() => selectLesson(lesson.id)}
                              aria-label={`${lesson.start_time} às ${lesson.end_time}. ${firstNamesFor(lesson).join(", ") || "Sem alunos"}`}
                            >
                              <strong>
                                {firstNamesFor(lesson).join(" · ") ||
                                  planFor(lesson)?.name ||
                                  "Aula"}
                              </strong>
                              <span>
                                {lesson.start_time} – {lesson.end_time}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {selected && (
        <div className="calendar-detail" role="dialog" aria-label="Detalhes da aula">
          <div className="calendar-detail-content">
            <p>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(fromKey(selected.class_date))}  · {selected.start_time}–{selected.end_time}</p>
            <h3>{selected.court || "Aula"}</h3>
            <span>{selected.student_ids.length} de 4 alunos · {selected.reservation_term === "monthly" ? "Reserva mensal" : selected.reservation_term === "semester" ? "Reserva semestral" : selected.reservation_term === "annual" ? "Reserva anual" : "Aula avulsa"}</span>
            <div className="calendar-student-actions">
              {selected.student_ids.map((studentId) => {
                const student = students.find((item) => item.id === studentId);
                if (!student) return <span key={studentId}>Aluno removido do cadastro</span>;
                const remaining = remainingFor(student, selected);
                return (
                  <div className="calendar-student-row" key={studentId}>
                    <div>
                      <strong>{student.full_name}</strong>
                      {remaining !== null && <small>{remaining} de {student.monthly_class_limit} aulas restantes neste mês</small>}
                    </div>
                    {selected.status === "scheduled" && (
                      <div className="calendar-student-buttons">
                        <button type="button" className="text-link" onClick={() => { setRescheduleError(""); setRescheduleId(rescheduleId === studentId ? null : studentId); }}>Remanejar</button>
                        <button type="button" className="text-link danger-action" onClick={() => onRemoveStudent(selected, studentId)}>Remover da aula</button>
                      </div>
                    )}
                    {rescheduleId === studentId && (
                      <form className="reschedule-form" onSubmit={(event) => submitReschedule(event, selected, studentId)}>
                        <label>Data<input name="class_date" type="date" required defaultValue={selected.class_date} /></label>
                        <label>Início<input name="start_time" type="time" required defaultValue={selected.start_time} /></label>
                        <label>Término<input name="end_time" type="time" required defaultValue={selected.end_time} /></label>
                        <label>Quadra<input name="court" defaultValue={selected.court} /></label>
                        <button className="primary-button" type="submit">Salvar horário</button>
                        {rescheduleError && <p className="form-error" role="alert">{rescheduleError}</p>}
                      </form>
                    )}
                  </div>
                );
              })}
              {!selected.student_ids.length && <p>Nenhum aluno nesta turma ainda.</p>}
            </div>
            {selected.status === "scheduled" && (
              <>
                <form className="calendar-add-student" onSubmit={(event) => {
                  event.preventDefault();
                  const chosenPlan = plans.find((plan) => plan.id === newPlanId && plan.active);
                  const limit = chosenPlan?.kind === "monthly" ? Number(monthlyLimit) : 1;
                  if (!newStudentId || !chosenPlan || (chosenPlan.kind === "monthly" && (!Number.isInteger(limit) || limit < 1 || limit > 31))) return;
                  onAddStudent(selected, newStudentId, chosenPlan.id, limit);
                  setNewStudentId(""); setNewPlanId(""); setMonthlyLimit("");
                }}>
                  <strong>Adicionar aluno</strong>
                  <label>Aluno
                    <select value={newStudentId} onChange={(event) => setNewStudentId(event.target.value)} required>
                      <option value="">Selecione um aluno cadastrado</option>
                      {students.filter((student) => student.status !== "inactive" && !selected.student_ids.includes(student.id)).map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
                    </select>
                  </label>
                  <label>Plano
                    <select value={newPlanId} onChange={(event) => setNewPlanId(event.target.value)} required>
                      <option value="">Selecione o plano</option>
                      {plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                    </select>
                  </label>
                  {plans.find((plan) => plan.id === newPlanId)?.kind === "monthly" && (
                    <label>Aulas por mês<input type="number" min="1" max="31" required value={monthlyLimit} onChange={(event) => setMonthlyLimit(event.target.value)} /></label>
                  )}
                  <button type="submit" className="secondary-button" disabled={selected.student_ids.length >= 4 || !newStudentId || !newPlanId}>Adicionar à turma</button>
                  {selected.student_ids.length >= 4 && <small>Limite de quatro alunos atingido.</small>}
                </form>
                <button type="button" className="primary-button" disabled={!selected.student_ids.length} onClick={() => onCheckIn(selected)}>Fazer check-in da turma</button>
              </>
            )}
            {selected.status === "completed" && <span className="completed-label">Turma concluída · check-in realizado</span>}
          </div>
          <button type="button" className="calendar-icon-button" aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}><Icon name="close" size={17} /></button>
        </div>
      )}
    </section>
  );
}
