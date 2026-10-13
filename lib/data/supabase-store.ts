import type { DataRepository, Invoice, Lesson, Plan, Student } from "./types";
import { createClient } from "../supabase/client";

type Row = Record<string, unknown>;
const asText = (value: unknown) => String(value ?? "");
const asTime = (value: unknown) => asText(value).slice(0, 5);

function studentRow(tenantId: string, student: Student) {
  return {
    id: student.id,
    tenant_id: tenantId,
    full_name: student.full_name,
    phone: student.phone || null,
    email: student.email || null,
    padel_level: student.padel_level || null,
    notes: student.notes || null,
    status: student.status,
    offering_id: student.plan_id || null,
    monthly_class_limit: student.monthly_class_limit || null,
    archived_at: student.archived_at || null,
    created_at: student.created_at,
  };
}

function planRow(tenantId: string, plan: Plan) {
  return { ...plan, tenant_id: tenantId };
}

function lessonRow(tenantId: string, lesson: Lesson, status = lesson.status) {
  return {
    id: lesson.id,
    tenant_id: tenantId,
    class_date: lesson.class_date,
    start_time: lesson.start_time,
    end_time: lesson.end_time,
    court: lesson.court || null,
    class_type: lesson.class_type,
    status,
    offering_id: lesson.plan_id || null,
    quoted_price_cents: lesson.quoted_price_cents ?? null,
    series_id: lesson.series_id || null,
    reservation_term: lesson.reservation_term || "single",
    notes: lesson.notes || null,
    created_at: lesson.created_at,
  };
}

function invoiceRow(tenantId: string, invoice: Invoice, student: Student) {
  return {
    id: invoice.id,
    tenant_id: tenantId,
    student_id: invoice.student_id,
    offering_id: student.plan_id || null,
    amount: invoice.amount_cents / 100,
    due_date: `${invoice.reference_month}-05`,
    status: "pending",
    student_name_snapshot: invoice.student_name,
    reference_month: `${invoice.reference_month}-01`,
    description: invoice.plan_name,
    created_at: invoice.created_at,
  };
}

export function createSupabaseRepository(): DataRepository {
  const client = createClient();
  let tenantPromise: Promise<string> | undefined;

  function tenant() {
    tenantPromise ??= (async () => {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth.user) throw new Error("Sessão expirada. Entre novamente.");
      const { data: profile, error } = await client
        .from("profiles")
        .select("tenant_id")
        .eq("id", auth.user.id)
        .single();
      if (error || !profile?.tenant_id) {
        throw new Error("Perfil do professor não encontrado. Confira se o schema foi instalado antes do cadastro.");
      }
      return profile.tenant_id as string;
    })().catch((error) => {
      tenantPromise = undefined;
      throw error;
    });
    return tenantPromise;
  }

  async function readAll(table: string, tenantId: string): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data as Row[]));
      if (!data || data.length < 1000) break;
    }
    return rows;
  }

  async function saveInvoice(tenantId: string, invoice: Invoice, student: Student) {
    const row = invoiceRow(tenantId, invoice, student);
    const { data: existing, error: readError } = await client
      .from("invoices")
      .select("id,status")
      .eq("tenant_id", tenantId)
      .eq("student_id", invoice.student_id)
      .eq("reference_month", row.reference_month)
      .maybeSingle();
    if (readError) throw readError;
    if (existing?.status === "paid") throw new Error("Cobrança deste mês já foi paga.");
    if (existing) {
      const { error } = await client.from("invoices").update({
        offering_id: row.offering_id,
        amount: row.amount,
        student_name_snapshot: row.student_name_snapshot,
        description: row.description,
      }).eq("tenant_id", tenantId).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("invoices").insert(row);
      if (error) throw error;
    }
  }

  async function ensureQuota(tenantId: string, studentId: string, date: string) {
    const { data: student, error: studentError } = await client
      .from("students")
      .select("offering_id,monthly_class_limit")
      .eq("tenant_id", tenantId)
      .eq("id", studentId)
      .single();
    if (studentError) throw studentError;
    let monthly = false;
    if (student.offering_id) {
      const { data: offering, error: offeringError } = await client
        .from("lesson_offerings")
        .select("kind")
        .eq("tenant_id", tenantId)
        .eq("id", student.offering_id)
        .single();
      if (offeringError) throw offeringError;
      monthly = offering.kind === "monthly";
    }
    // The installed attendance trigger consumes a quota for every plan kind.
    const allowed = monthly ? (student.monthly_class_limit ?? 1) : 32767;
    const month = `${date.slice(0, 7)}-01`;
    const { data: quota, error: quotaError } = await client
      .from("monthly_quotas")
      .select("id,total_classes,used_classes")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("period_month", month)
      .maybeSingle();
    if (quotaError) throw quotaError;
    if (quota) {
      const total = Math.max(allowed, quota.used_classes);
      if (total > quota.total_classes) {
        const { error } = await client.from("monthly_quotas")
          .update({ total_classes: total }).eq("tenant_id", tenantId).eq("id", quota.id);
        if (error) throw error;
      }
    } else {
      const { error } = await client.from("monthly_quotas").upsert({
        tenant_id: tenantId,
        student_id: studentId,
        period_month: month,
        total_classes: allowed,
        used_classes: 0,
      }, { onConflict: "tenant_id,student_id,period_month", ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  async function syncStudents(tenantId: string, lesson: Lesson) {
    const { data: current, error: readError } = await client
      .from("class_students")
      .select("id,student_id,attendance_status")
      .eq("tenant_id", tenantId)
      .eq("class_id", lesson.id);
    if (readError) throw readError;
    const wanted = new Set(lesson.student_ids);
    for (const row of current ?? []) {
      if (!wanted.has(row.student_id)) {
        const { error } = await client.from("class_students").delete()
          .eq("tenant_id", tenantId).eq("id", row.id);
        if (error) throw error;
      }
    }
    for (const studentId of lesson.student_ids) {
      const status = (lesson.checked_in_student_ids ?? []).includes(studentId)
        ? "attended" : "scheduled";
      const row = (current ?? []).find((item) => item.student_id === studentId);
      if (row?.attendance_status === status) continue;
      if (status === "attended") await ensureQuota(tenantId, studentId, lesson.class_date);
      const result = row
        ? await client.from("class_students").update({ attendance_status: status })
          .eq("tenant_id", tenantId).eq("id", row.id)
        : await client.from("class_students").insert({
          tenant_id: tenantId, class_id: lesson.id, student_id: studentId,
          attendance_status: status,
        });
      if (result.error) throw result.error;
    }
  }

  async function writeLesson(tenantId: string, lesson: Lesson, insert: boolean) {
    const row = lessonRow(tenantId, lesson, "scheduled");
    const result = insert
      ? await client.from("classes").insert(row)
      : await client.from("classes").update(row).eq("tenant_id", tenantId).eq("id", lesson.id);
    if (result.error) throw result.error;
    try {
      await syncStudents(tenantId, lesson);
      if (lesson.status !== "scheduled") {
        const { error } = await client.from("classes").update({ status: lesson.status })
          .eq("tenant_id", tenantId).eq("id", lesson.id);
        if (error) throw error;
      }
    } catch (error) {
      if (insert) await client.from("classes").delete()
        .eq("tenant_id", tenantId).eq("id", lesson.id);
      throw error;
    }
  }

  const repository: DataRepository = {
    async load() {
      const tenantId = await tenant();
      const [studentRows, planRows, lessonRows, memberRows, invoiceRows] = await Promise.all([
        readAll("students", tenantId),
        readAll("lesson_offerings", tenantId),
        readAll("classes", tenantId),
        readAll("class_students", tenantId),
        readAll("invoices", tenantId),
      ]);
      const plans: Plan[] = planRows.map((row) => ({
        id: asText(row.id), name: asText(row.name), kind: row.kind as Plan["kind"],
        group_size: row.group_size == null ? null : Number(row.group_size),
        price_cents: Number(row.price_cents), price_unit: row.price_unit as Plan["price_unit"],
        duration_minutes: Number(row.duration_minutes), active: Boolean(row.active),
      }));
      const students: Student[] = studentRows.map((row) => ({
        id: asText(row.id), full_name: asText(row.full_name), phone: asText(row.phone),
        email: asText(row.email), padel_level: asText(row.padel_level), notes: asText(row.notes),
        status: row.status as Student["status"], created_at: asText(row.created_at),
        plan_id: row.offering_id ? asText(row.offering_id) : undefined,
        monthly_class_limit: row.monthly_class_limit == null ? undefined : Number(row.monthly_class_limit),
        archived_at: row.archived_at ? asText(row.archived_at) : undefined,
      }));
      const membersByClass = new Map<string, Row[]>();
      for (const member of memberRows) {
        if (member.attendance_status === "cancelled_teacher") continue;
        const classId = asText(member.class_id);
        const members = membersByClass.get(classId) ?? [];
        members.push(member);
        membersByClass.set(classId, members);
      }
      const lessons: Lesson[] = lessonRows.map((row) => {
        const members = membersByClass.get(asText(row.id)) ?? [];
        return {
          id: asText(row.id), class_date: asText(row.class_date),
          start_time: asTime(row.start_time), end_time: asTime(row.end_time),
          court: asText(row.court), class_type: row.class_type as Lesson["class_type"],
          status: row.status as Lesson["status"],
          student_ids: members.map((member) => asText(member.student_id)),
          checked_in_student_ids: members.filter((member) => member.attendance_status === "attended")
            .map((member) => asText(member.student_id)),
          plan_id: row.offering_id ? asText(row.offering_id) : undefined,
          quoted_price_cents: row.quoted_price_cents == null ? undefined : Number(row.quoted_price_cents),
          series_id: row.series_id ? asText(row.series_id) : undefined,
          reservation_term: row.reservation_term as Lesson["reservation_term"],
          notes: asText(row.notes), created_at: asText(row.created_at),
        };
      });
      const invoices: Invoice[] = invoiceRows.filter((row) => row.status !== "paid")
        .map((row) => ({
          id: asText(row.id), student_id: asText(row.student_id),
          student_name: asText(row.student_name_snapshot),
          plan_name: asText(row.description) || plans.find((plan) => plan.id === row.offering_id)?.name || "Plano",
          amount_cents: Math.round(Number(row.amount) * 100),
          reference_month: asText(row.reference_month).slice(0, 7),
          status: "open", created_at: asText(row.created_at),
        }));
      return { students, plans, lessons, invoices };
    },
    async createStudent(student, invoice) {
      const tenantId = await tenant();
      const { error } = await client.from("students").insert(studentRow(tenantId, student));
      if (error) throw error;
      try {
        if (invoice) await saveInvoice(tenantId, invoice, student);
      } catch (invoiceError) {
        const { error: rollbackError } = await client.from("students").delete()
          .eq("tenant_id", tenantId).eq("id", student.id);
        if (rollbackError) throw new Error(
          `Aluno salvo, mas a cobrança falhou e a reversão também: ${rollbackError.message}`,
        );
        throw invoiceError;
      }
    },
    async updateStudent(student, invoice) {
      const tenantId = await tenant();
      const { data: previous, error: readError } = await client.from("students")
        .select("*").eq("tenant_id", tenantId).eq("id", student.id).single();
      if (readError) throw readError;
      const { error } = await client.from("students").update(studentRow(tenantId, student))
        .eq("tenant_id", tenantId).eq("id", student.id);
      if (error) throw error;
      try {
        if (invoice) await saveInvoice(tenantId, invoice, student);
      } catch (invoiceError) {
        const { error: rollbackError } = await client.from("students").update(previous)
          .eq("tenant_id", tenantId).eq("id", student.id);
        if (rollbackError) throw new Error(
          `Aluno atualizado, mas a cobrança falhou e a reversão também: ${rollbackError.message}`,
        );
        throw invoiceError;
      }
    },
    async deleteStudent(id) {
      const tenantId = await tenant();
      const data = await repository.load();
      for (const lesson of data.lessons.filter((item) =>
        item.status === "scheduled" && item.student_ids.includes(id),
      )) {
        const studentIds = lesson.student_ids.filter((item) => item !== id);
        if (!studentIds.length) await repository.deleteLesson(lesson.id);
        else await repository.updateLesson({ ...lesson, student_ids: studentIds,
          checked_in_student_ids: (lesson.checked_in_student_ids ?? []).filter((item) => item !== id),
        });
      }
      const { error } = await client.from("students")
        .update({ archived_at: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("id", id);
      if (error) throw error;
    },
    async createLessons(lessons) {
      const tenantId = await tenant();
      const created: string[] = [];
      try {
        for (const lesson of lessons) {
          await writeLesson(tenantId, lesson, true);
          created.push(lesson.id);
        }
      } catch (error) {
        for (const id of created.reverse()) await repository.deleteLesson(id);
        throw error;
      }
    },
    async updateLesson(lesson) {
      await writeLesson(await tenant(), lesson, false);
    },
    async updateLessons(lessons) {
      const tenantId = await tenant();
      for (const lesson of lessons) await writeLesson(tenantId, lesson, false);
    },
    async deleteLesson(id) {
      const tenantId = await tenant();
      const { error } = await client.from("classes").delete()
        .eq("tenant_id", tenantId).eq("id", id);
      if (error) throw error;
    },
    async rescheduleStudent(source, destination, studentId) {
      await repository.createLessons([destination]);
      const remaining = source.student_ids.filter((id) => id !== studentId);
      try {
        if (!remaining.length) await repository.deleteLesson(source.id);
        else await repository.updateLesson({ ...source, student_ids: remaining,
          checked_in_student_ids: (source.checked_in_student_ids ?? []).filter((id) => id !== studentId),
        });
      } catch (error) {
        await repository.deleteLesson(destination.id);
        throw error;
      }
    },
    async createPlan(plan) {
      const { error } = await client.from("lesson_offerings")
        .insert(planRow(await tenant(), plan));
      if (error) throw error;
    },
    async updatePlan(plan) {
      const tenantId = await tenant();
      const { error } = await client.from("lesson_offerings")
        .update(planRow(tenantId, plan)).eq("tenant_id", tenantId).eq("id", plan.id);
      if (error) throw error;
    },
  };
  return repository;
}
