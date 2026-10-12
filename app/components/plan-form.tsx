"use client";

import { useState, type FormEvent } from "react";
import type { Plan, PlanKind } from "../../lib/data/types";
import { Icon } from "./icons";

export function PlanForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Plan | null;
  onSave: (plan: Plan) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const rawPrice = String(values.get("price") ?? "").trim();
    const normalizedPrice = rawPrice.includes(",")
      ? rawPrice.replace(/\./g, "").replace(",", ".")
      : rawPrice;
    const priceCents = Math.round(Number(normalizedPrice) * 100);
    if (name.length < 2) {
      setError("Informe um nome para o plano.");
      return;
    }
    if (!Number.isSafeInteger(priceCents) || priceCents <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    setError("");
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      kind: String(values.get("kind")) as PlanKind,
      group_size: values.get("group_size")
        ? Number(values.get("group_size"))
        : null,
      price_cents: priceCents,
      price_unit: String(values.get("price_unit")) as Plan["price_unit"],
      duration_minutes: Number(values.get("duration_minutes")),
      active: values.has("active"),
    });
  }
  return (
    <form className="form-panel" onSubmit={submit}>
      <div className="form-intro">
        <h2>{initial ? "Editar plano" : "Novo plano"}</h2>
        <p>Valor mensal representa preço por hora/aula, não total do mês.</p>
      </div>
      <div className="form-grid">
        <label className="field field-wide">
          Nome *
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={initial?.name}
            placeholder="Ex.: Dupla"
          />
        </label>
        <label className="field">
          Categoria
          <select name="kind" defaultValue={initial?.kind ?? "monthly"}>
            <option value="monthly">Horário mensal</option>
            <option value="drop_in">Aula avulsa</option>
            <option value="game">Jogo aula</option>
          </select>
        </label>
        <label className="field">
          Participantes
          <select name="group_size" defaultValue={initial?.group_size ?? ""}>
            <option value="">Até 4</option>
            <option value="1">1 aluno</option>
            <option value="2">2 alunos</option>
            <option value="3">3 alunos</option>
            <option value="4">4 alunos</option>
          </select>
        </label>
        <label className="field">
          Valor em R$ *
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={
              initial
                ? (initial.price_cents / 100).toFixed(2).replace(".", ",")
                : ""
            }
            placeholder="130,00"
          />
        </label>
        <label className="field">
          Cobrança
          <select
            name="price_unit"
            defaultValue={initial?.price_unit ?? "per_class"}
          >
            <option value="per_class">Por aula / grupo</option>
            <option value="per_student">Por aluno</option>
          </select>
        </label>
        <label className="field">
          Duração (minutos)
          <input
            name="duration_minutes"
            type="number"
            min="15"
            max="240"
            required
            defaultValue={initial?.duration_minutes ?? 60}
          />
        </label>
        <label className="check-field">
          <input
            name="active"
            type="checkbox"
            defaultChecked={initial?.active ?? true}
          />{" "}
          Plano disponível para novas aulas
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
          <Icon name="check" size={17} /> Salvar plano
        </button>
      </div>
    </form>
  );
}
