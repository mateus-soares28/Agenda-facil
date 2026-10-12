"use client";

import { useState, type FormEvent } from "react";
import type {
  Lesson,
  Plan,
  Student,
  StudentStatus,
} from "../../lib/data/types";
import { formatCurrency } from "../../lib/data/format";
import { Icon } from "./icons";

export function StudentForm({
  initial,
  plans,
  onSave,
  onCancel,
}: {
  initial?: Student | null;
  plans: Plan[];
  onSave: (student: Student) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [planId, setPlanId] = useState(initial?.plan_id ?? "");
  const selectedPlan = plans.find(
    (plan) =>
      plan.id === planId && (plan.active || plan.id === initial?.plan_id),
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const fullName = String(values.get("full_name") ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (fullName.length < 2) {
      setError("Informe o nome completo do aluno.");
      return;
    }
    const monthlyClassLimit = Number(values.get("monthly_class_limit"));
    if (
      selectedPlan?.kind === "monthly" &&
      (!Number.isInteger(monthlyClassLimit) ||
        monthlyClassLimit < 1 ||
        monthlyClassLimit > 31)
    ) {
      setError(
        "Informe de 1 a 31 aulas mensais para calcular o valor em aberto.",
      );
      return;
    }
    setError("");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      full_name: fullName,
      phone: String(values.get("phone") ?? "").trim(),
      email: String(values.get("email") ?? "")
        .trim()
        .toLowerCase(),
      padel_level: String(values.get("padel_level") ?? ""),
      notes: String(values.get("notes") ?? "").trim(),
      status: String(values.get("status")) as StudentStatus,
      created_at: initial?.created_at ?? new Date().toISOString(),
      plan_id: selectedPlan?.id,
      monthly_class_limit:
        selectedPlan?.kind === "monthly" ? monthlyClassLimit : 1,
    });
  }
  return (
    <form className="form-panel" onSubmit={submit}>
      <div className="form-intro">
        <h2>{initial ? "Editar aluno" : "Dados do aluno"}</h2>
        <p>
          {initial
            ? "Atualize as informações do cadastro."
            : "Preencha apenas o que já sabe. Contato e observações podem ser adicionados depois."}
        </p>
      </div>
      <div className="form-grid">
        <label className="field field-wide">
          Nome completo *
          <input
            name="full_name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Nome do aluno"
            defaultValue={initial?.full_name}
          />
        </label>
        <label className="field">
          Telefone / WhatsApp
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={30}
            placeholder="(00) 00000-0000"
            defaultValue={initial?.phone}
          />
        </label>
        <label className="field">
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={160}
            placeholder="aluno@exemplo.com"
            defaultValue={initial?.email}
          />
        </label>
        <label className="field">
          Nível
          <select name="padel_level" defaultValue={initial?.padel_level ?? ""}>
            <option value="">Não informado</option>
            <option value="Iniciante">Iniciante</option>
            <option value="Intermediário">Intermediário</option>
            <option value="Avançado">Avançado</option>
          </select>
        </label>
        <label className="field">
          Situação
          <select name="status" defaultValue={initial?.status ?? "active"}>
            <option value="active">Ativo</option>
            <option value="trial">Experimental</option>
            <option value="inactive">Inativo</option>
          </select>
        </label>
        <label className="field field-wide">
          Plano do aluno
          <select
            name="plan_id"
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
          >
            <option value="">Sem plano financeiro</option>
            {plans
              .filter((plan) => plan.active || plan.id === initial?.plan_id)
              .map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.kind === "monthly"
                    ? "Mensal"
                    : plan.kind === "drop_in"
                      ? "Avulsa"
                      : "Jogo aula"}{" "}
                  · {plan.name} · {formatCurrency(plan.price_cents)}
                </option>
              ))}
          </select>
          {selectedPlan && (
            <small>
              Valor em aberto usa preço por aula × aulas mensais. Plano cobrado
              por turma é dividido pelos participantes.
            </small>
          )}
        </label>
        {selectedPlan?.kind === "monthly" && (
          <label className="field">
            Aulas mensais *
            <input
              name="monthly_class_limit"
              type="number"
              min="1"
              max="31"
              required
              defaultValue={initial?.monthly_class_limit ?? ""}
              placeholder="Ex.: 8"
            />
          </label>
        )}
        <label className="field field-wide">
          Observações
          <textarea
            name="notes"
            rows={4}
            maxLength={1000}
            placeholder="Informações úteis para as aulas"
            defaultValue={initial?.notes}
          />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary-button">
          <Icon name="check" size={17} />{" "}
          {initial ? "Salvar alterações" : "Salvar aluno"}
        </button>
      </div>
    </form>
  );
}

export function LessonForm({ today, onSave, onCancel }: {
  today: string;
  onSave: (lessons: Lesson[]) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const start = String(values.get("start_time"));
    const end = String(values.get("end_time"));
    if (end <= start) {
      setError("O horário de término deve ser depois do início.");
      return;
    }
    const court = String(values.get("court") ?? "").trim();
    if (!court) {
      setError("Informe a quadra para reservar o horário.");
      return;
    }
    const term = String(values.get("reservation_term")) as Lesson["reservation_term"];
    const firstDate = String(values.get("class_date"));
    const occurrences = [firstDate];
    if (term !== "single") {
      const duration = term === "monthly" ? 1 : term === "semester" ? 6 : 12;
      const [year, month, day] = firstDate.split("-").map(Number);
      const endDate = new Date(year, month - 1 + duration, day, 12);
      if (endDate.getDate() !== day) endDate.setDate(0);
      const next = new Date(year, month - 1, day + 7, 12);
      while (next < endDate) {
        occurrences.push(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
        next.setDate(next.getDate() + 7);
      }
    }
    const seriesId = term === "single" ? undefined : crypto.randomUUID();
    setError("");
    onSave(occurrences.map((classDate) => ({
      id: crypto.randomUUID(),
      class_date: classDate,
      start_time: start,
      end_time: end,
      court,
      class_type: "regular",
      status: "scheduled",
      student_ids: [],
      checked_in_student_ids: [],
      series_id: seriesId,
      reservation_term: term,
      notes: String(values.get("notes") ?? "").trim(),
      created_at: new Date().toISOString(),
    })));
  }
  return (
    <form className="form-panel" onSubmit={submit}>
      <div className="form-intro">
        <h2>Reservar horário</h2>
        <p>Escolha a quadra e a duração da reserva. Alunos e planos são adicionados na aula.</p>
      </div>
      <div className="form-grid">
        <label className="field">
          Data inicial *
          <input name="class_date" type="date" defaultValue={today} required />
        </label>
        <label className="field">
          Duração da reserva
          <select name="reservation_term" defaultValue="single">
            <option value="single">Avulsa</option>
            <option value="monthly">Mensal · semanal</option>
            <option value="semester">Semestral · semanal</option>
            <option value="annual">Anual · semanal</option>
          </select>
          <small>Reservas recorrentes repetem no mesmo dia da semana até o fim do período.</small>
        </label>
        <label className="field">
          Início *<input name="start_time" type="time" required />
        </label>
        <label className="field">
          Término *<input name="end_time" type="time" required />
        </label>
        <label className="field field-wide">
          Quadra *
          <input name="court" required maxLength={100} placeholder="Nome ou número da quadra" />
        </label>
        <label className="field field-wide">
          Observações
          <textarea name="notes" rows={3} maxLength={1000} placeholder="Detalhes da aula" />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary-button"><Icon name="check" size={17} /> Reservar horário</button>
      </div>
    </form>
  );
}
