# Supabase setup

1. Create a Supabase project and run [`schema.sql`](./schema.sql) once in its SQL Editor.
   The script targets a new project; an existing installation needs a separate migration for `lesson_offerings` and the new `classes` columns.
2. Set Authentication → URL Configuration → Site URL to `https://agenda-facil-snowy.vercel.app`. Add `https://agenda-facil-snowy.vercel.app/auth/callback` and `http://localhost:3000/**` to Redirect URLs. The `auth.users` trigger creates one tenant, profile, and settings record for every new account; install the schema before signing up teachers. The app uses email/password login and `/auth/callback` for confirmation. Configure custom SMTP before sending production email to users outside the Supabase project team.
3. Enable `pg_cron` in Supabase and schedule the monthly job for 03:00 UTC on day 1 (midnight in São Paulo), plus the overdue check daily:

```sql
select cron.schedule(
  'monthly-student-records',
  '0 3 1 * *',
  $$ select public.generate_monthly_records(
       date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
     ); $$
);

select cron.schedule(
  'mark-late-invoices',
  '5 3 * * *',
  $$ select public.mark_late_invoices(); $$
);
```

Both functions are idempotent where applicable and executable only by the database owner or `service_role`. Never expose the service role key in the browser. Monthly invoices and lesson quotas are generated independently from attendance; the class attendance trigger updates quota usage in the same database transaction.

The app saves student, lesson, offering, attendance, and open invoice entries through `lib/data/supabase-store.ts` using the signed-in teacher's session. Ten price-list entries from the supplied images are seeded in `lesson_offerings` for each new tenant. Monthly entries are prices per lesson, not monthly invoice totals. The legacy `agenda-facil:data:v1` browser record is deleted when the teacher opens the agenda. Settings still exports current Supabase data as JSON.

The UI model in `lib/data/types.ts` follows `students`, `classes`, and `lesson_offerings`. `Lesson.student_ids` maps to `class_students`; `Lesson.checked_in_student_ids` maps to `attendance_status = 'attended'`; `Lesson.plan_id` maps to `classes.offering_id`. Student plan assignment uses `students.offering_id` and `students.monthly_class_limit`. The older `plans` table is for monthly subscription billing and must not be used for the app's per-lesson price list. Student removal is archival through `students.archived_at`, so historical invoices remain linked and scheduled enrollments can be removed without deleting other students' class records. The class and settings limits cap each class at four students. All reads and writes use the teacher's session so RLS enforces tenant isolation; do not expose a `service_role` key in the client.

The app does not yet register payments or manage leads. Capacity and quota rules are enforced by PostgreSQL triggers. Configure the monthly cron jobs above before relying on recurring invoices. Verify two distinct teacher accounts cannot read or change each other's rows before publishing.
