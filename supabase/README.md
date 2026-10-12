# Supabase setup

1. Create a Supabase project and run [`schema.sql`](./schema.sql) once in its SQL Editor.
   The script targets a new project; an existing installation needs a separate migration for `lesson_offerings` and the new `classes` columns.
2. Configure Auth redirects for the future app domain. The `auth.users` trigger creates one tenant, profile, and settings record for every new account.
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

The app currently saves student, lesson, and plan entries in this browser via `lib/data/browser-store.ts`. It starts with no sample students or lessons. Ten price-list entries from the supplied images are seeded locally and in `lesson_offerings` for each new Supabase tenant. Monthly entries are prices per lesson, not monthly invoice totals. Local storage is specific to one browser and is not synced or backed up by Supabase.

The UI model in `lib/data/types.ts` follows `students`, `classes`, and `lesson_offerings`. `Lesson.student_ids` maps to `class_students`; `Lesson.checked_in_student_ids` maps to `attendance_status = 'attended'`; `Lesson.plan_id` maps to `classes.offering_id`. Student plan assignment uses `students.offering_id` and `students.monthly_class_limit`. The older `plans` table is for monthly subscription billing and must not be used for the app's per-lesson price list. Student removal is archival through `students.archived_at`, so historical invoices remain linked and scheduled enrollments can be removed without deleting other students' class records. The class and settings limits cap each class at four students. To connect the app, add Supabase Auth, resolve the authenticated user's `tenant_id` from `profiles`, and implement a repository with the same `DataRepository` contract. All reads and writes must use that user's session so RLS can enforce tenant isolation. Migrate existing browser records explicitly before switching the repository; do not expose a `service_role` key in the client.

The app does not yet authenticate, fetch Supabase rows, register payments, or run the monthly jobs. Capacity and quota rules are enforced by PostgreSQL triggers once the app is connected.
