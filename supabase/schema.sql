-- Core schema for Agenda Fácil. Run in a Supabase SQL editor.
-- Each authenticated teacher receives one tenant at sign-up. Extend the
-- profiles/tenant model with memberships when team accounts are introduced.

create extension if not exists pgcrypto with schema extensions;

create type public.student_status as enum ('active', 'inactive', 'trial');
create type public.class_status as enum ('scheduled', 'completed', 'cancelled');
create type public.class_type as enum ('regular', 'trial', 'drop_in');
create type public.attendance_status as enum (
  'scheduled',
  'attended',
  'missed_charged',
  'missed_free',
  'cancelled_teacher'
);
create type public.invoice_status as enum ('pending', 'paid', 'late');
create type public.payment_method as enum ('pix', 'cash', 'card', 'transfer', 'other');
create type public.lead_status as enum (
  'new',
  'in_conversation',
  'trial_scheduled',
  'trial_completed',
  'converted',
  'lost'
);
create type public.trial_status as enum ('scheduled', 'completed', 'cancelled', 'converted');
create type public.message_template_kind as enum (
  'billing',
  'payment_reminder',
  'class_confirmation',
  'trial_class',
  'welcome'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Minha escola',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  full_name text not null default '',
  phone text,
  whatsapp_phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_tenant_user_unique unique (tenant_id, id)
);

-- Used by RLS policies. SECURITY DEFINER avoids recursive profile policies.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p.tenant_id
  from public.profiles as p
  where p.id = (select auth.uid())
  limit 1
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated, service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.create_tenant_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_tenant_id uuid;
  account_name text;
begin
  account_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Professor'
  );

  insert into public.tenants (owner_user_id, name)
  values (new.id, account_name)
  returning id into new_tenant_id;

  insert into public.profiles (id, tenant_id, full_name, email)
  values (new.id, new_tenant_id, account_name, new.email);

  insert into public.settings (tenant_id, teacher_name)
  values (new_tenant_id, account_name);

  insert into public.lesson_offerings
    (id, tenant_id, name, kind, group_size, price_cents, price_unit)
  values
    ('monthly-individual', new_tenant_id, 'Individual', 'monthly', 1, 13000, 'per_class'),
    ('monthly-duo', new_tenant_id, 'Dupla', 'monthly', 2, 16000, 'per_class'),
    ('monthly-trio', new_tenant_id, 'Trio', 'monthly', 3, 19000, 'per_class'),
    ('monthly-quartet', new_tenant_id, 'Quarteto', 'monthly', 4, 22000, 'per_class'),
    ('drop-in-individual', new_tenant_id, 'Individual', 'drop_in', 1, 14000, 'per_class'),
    ('drop-in-duo', new_tenant_id, 'Dupla', 'drop_in', 2, 18000, 'per_class'),
    ('drop-in-trio', new_tenant_id, 'Trio', 'drop_in', 3, 21000, 'per_class'),
    ('drop-in-quartet', new_tenant_id, 'Quarteto', 'drop_in', 4, 24000, 'per_class'),
    ('game-coach', new_tenant_id, 'Jogo aula com professor', 'game', null, 6000, 'per_student'),
    ('game-monitored', new_tenant_id, 'Jogo monitorado', 'game', null, 5000, 'per_student');

  return new;
end;
$$;

create table public.settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  teacher_name text not null default '',
  phone text,
  whatsapp_phone text,
  email text,
  default_class_price numeric(10, 2) not null default 0 check (default_class_price >= 0),
  pix_key text,
  max_students_per_class smallint not null default 4 check (max_students_per_class between 1 and 4),
  default_duration_minutes smallint not null default 60 check (default_duration_minutes between 15 and 240),
  charge_absences_by_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp_phone text,
  email text,
  date_of_birth date,
  registered_at date not null default current_date,
  padel_level text,
  notes text,
  status public.student_status not null default 'active',
  offering_id text,
  monthly_class_limit smallint check (monthly_class_limit between 1 and 31),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_tenant_id_unique unique (tenant_id, id)
);

create index students_tenant_name_idx on public.students (tenant_id, full_name);
create index students_tenant_status_idx on public.students (tenant_id, status);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  classes_per_month smallint not null default 4 check (classes_per_month between 0 and 100),
  price numeric(10, 2) not null default 0 check (price >= 0),
  duration_minutes smallint not null default 60 check (duration_minutes between 15 and 240),
  max_students smallint not null default 4 check (max_students between 1 and 30),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_tenant_id_unique unique (tenant_id, id)
);

-- Price list shown in the app. Monthly prices here are per lesson, never a
-- monthly invoice total. The older plans table above serves subscription billing.
create table public.lesson_offerings (
  id text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('monthly', 'drop_in', 'game')),
  group_size smallint check (group_size between 1 and 30),
  price_cents integer not null check (price_cents > 0),
  price_unit text not null check (price_unit in ('per_class', 'per_student')),
  duration_minutes smallint not null default 60 check (duration_minutes between 15 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

alter table public.students
  add constraint students_offering_fk foreign key (tenant_id, offering_id)
  references public.lesson_offerings (tenant_id, id) on delete restrict;

create table public.student_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  plan_id uuid not null,
  due_day smallint not null default 5 check (due_day between 1 and 31),
  starts_on date not null default current_date,
  ends_on date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  constraint student_plans_tenant_id_unique unique (tenant_id, id),
  constraint student_plans_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  constraint student_plans_plan_fk foreign key (tenant_id, plan_id)
    references public.plans (tenant_id, id) on delete restrict,
  constraint student_plans_date_order check (ends_on is null or ends_on >= starts_on)
);

create unique index student_plans_one_current_idx
  on public.student_plans (tenant_id, student_id) where is_current;
create index student_plans_plan_idx on public.student_plans (tenant_id, plan_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_date date not null,
  start_time time not null,
  end_time time not null,
  court text,
  status public.class_status not null default 'scheduled',
  class_type public.class_type not null default 'regular',
  offering_id text,
  quoted_price_cents integer check (quoted_price_cents >= 0),
  series_id uuid,
  reservation_term text not null default 'single'
    check (reservation_term in ('single', 'monthly', 'semester', 'annual')),
  max_students smallint not null default 4 check (max_students between 1 and 4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_tenant_id_unique unique (tenant_id, id),
  constraint classes_time_order check (end_time > start_time),
  constraint classes_offering_fk foreign key (tenant_id, offering_id)
    references public.lesson_offerings (tenant_id, id) on delete restrict
);

create index classes_tenant_date_time_idx
  on public.classes (tenant_id, class_date, start_time);
create index classes_tenant_status_date_idx
  on public.classes (tenant_id, status, class_date);

create table public.monthly_quotas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  period_month date not null,
  total_classes smallint not null check (total_classes >= 0),
  used_classes smallint not null default 0 check (used_classes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_quotas_month_start check (extract(day from period_month) = 1),
  constraint monthly_quotas_used_within_total check (used_classes <= total_classes),
  constraint monthly_quotas_tenant_id_unique unique (tenant_id, id),
  constraint monthly_quotas_student_month_unique unique (tenant_id, student_id, period_month),
  constraint monthly_quotas_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict
);

create index monthly_quotas_student_period_idx
  on public.monthly_quotas (tenant_id, student_id, period_month desc);

create table public.class_students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_id uuid not null,
  student_id uuid not null,
  attendance_status public.attendance_status not null default 'scheduled',
  -- Keeps a consumed lesson attached to the cycle it actually used.
  quota_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_students_pair_unique unique (tenant_id, class_id, student_id),
  constraint class_students_tenant_id_unique unique (tenant_id, id),
  constraint class_students_quota_month_start check (
    quota_month is null or extract(day from quota_month) = 1
  ),
  constraint class_students_class_fk foreign key (tenant_id, class_id)
    references public.classes (tenant_id, id) on delete cascade,
  constraint class_students_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict
);

create index class_students_student_idx on public.class_students (tenant_id, student_id);
create index class_students_class_idx on public.class_students (tenant_id, class_id);

-- Lock the class row before counting seats so concurrent joins cannot overfill it.
create or replace function public.enforce_class_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  class_capacity smallint;
  current_class_status public.class_status;
  enrolled_count integer;
  court_enrolled_count integer;
begin
  if new.attendance_status = 'cancelled_teacher' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.tenant_id = old.tenant_id
     and new.class_id = old.class_id
     and new.student_id = old.student_id
     and (new.attendance_status = 'cancelled_teacher'
          or old.attendance_status <> 'cancelled_teacher') then
    return new;
  end if;

  select c.max_students, c.status
  into class_capacity, current_class_status
  from public.classes as c
  where c.tenant_id = new.tenant_id and c.id = new.class_id
  for update;

  if current_class_status is distinct from 'scheduled'::public.class_status then
    raise exception 'Students can only be added to a scheduled class.'
      using errcode = 'check_violation';
  end if;

  select count(*)
  into enrolled_count
  from public.class_students as cs
  where cs.tenant_id = new.tenant_id
    and cs.class_id = new.class_id
    and cs.attendance_status <> 'cancelled_teacher'::public.attendance_status
    and (tg_op = 'INSERT' or cs.id <> new.id);

  if enrolled_count >= class_capacity then
    raise exception 'Class is full (maximum % students).', class_capacity
      using errcode = 'check_violation';
  end if;

  select count(*)
  into court_enrolled_count
  from public.classes as current_class
  join public.classes as overlapping_class
    on overlapping_class.tenant_id = current_class.tenant_id
   and overlapping_class.class_date = current_class.class_date
   and lower(btrim(overlapping_class.court)) = lower(btrim(current_class.court))
   and overlapping_class.start_time < current_class.end_time
   and overlapping_class.end_time > current_class.start_time
   and overlapping_class.status = 'scheduled'
   and overlapping_class.id <> current_class.id
  join public.class_students as enrolled
    on enrolled.tenant_id = overlapping_class.tenant_id
   and enrolled.class_id = overlapping_class.id
   and enrolled.attendance_status <> 'cancelled_teacher'::public.attendance_status
  where current_class.tenant_id = new.tenant_id
    and current_class.id = new.class_id
    and nullif(btrim(current_class.court), '') is not null;

  if enrolled_count + court_enrolled_count >= 4 then
    raise exception 'Court is full (maximum 4 students across overlapping classes).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger class_students_capacity
  before insert or update of class_id, student_id, attendance_status on public.class_students
  for each row execute function public.enforce_class_capacity();

create or replace function public.enforce_class_capacity_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  enrolled_count integer;
begin
  if new.max_students < old.max_students then
    select count(*)
    into enrolled_count
    from public.class_students as cs
    where cs.tenant_id = new.tenant_id
      and cs.class_id = new.id
      and cs.attendance_status <> 'cancelled_teacher'::public.attendance_status;

    if enrolled_count > new.max_students then
      raise exception 'Class already has % students; capacity cannot be reduced below that.', enrolled_count
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger classes_capacity_limit
  before update of max_students on public.classes
  for each row execute function public.enforce_class_capacity_limit();

-- Attended classes and charged absences consume one monthly quota. Reversing
-- attendance or cancelling a class restores it inside the same database transaction.
create or replace function public.apply_attendance_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_consumes boolean := false;
  new_consumes boolean := false;
  same_target boolean := false;
  new_quota_month date;
  old_quota_month date;
begin
  if tg_op <> 'INSERT' then
    old_consumes := old.attendance_status in ('attended', 'missed_charged');
    old_quota_month := old.quota_month;
  end if;

  if tg_op <> 'DELETE' then
    new_consumes := new.attendance_status in ('attended', 'missed_charged');
  end if;

  if tg_op = 'UPDATE' then
    same_target := old.tenant_id = new.tenant_id
      and old.class_id = new.class_id
      and old.student_id = new.student_id;
  end if;

  if old_consumes and (tg_op = 'DELETE' or not new_consumes or not same_target) then
    update public.monthly_quotas as q
    set used_classes = q.used_classes - 1,
        updated_at = now()
    where q.tenant_id = old.tenant_id
      and q.student_id = old.student_id
      and q.period_month = old_quota_month
      and q.used_classes > 0;
  end if;

  if new_consumes and (tg_op = 'INSERT' or not old_consumes or not same_target) then
    select date_trunc('month', c.class_date)::date
    into new_quota_month
    from public.classes as c
    where c.tenant_id = new.tenant_id and c.id = new.class_id;

    update public.monthly_quotas as q
    set used_classes = q.used_classes + 1,
        updated_at = now()
    where q.tenant_id = new.tenant_id
      and q.student_id = new.student_id
      and q.period_month = new_quota_month
      and q.used_classes < q.total_classes;

    if not found then
      raise exception 'No available monthly lesson quota for this student and month.'
        using errcode = 'check_violation';
    end if;

    update public.class_students as cs
    set quota_month = new_quota_month
    where cs.tenant_id = new.tenant_id and cs.id = new.id;
  elsif not new_consumes and tg_op <> 'DELETE' and new.quota_month is not null then
    update public.class_students as cs
    set quota_month = null
    where cs.tenant_id = new.tenant_id and cs.id = new.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger class_students_quota
  after insert or update of attendance_status, class_id, student_id or delete
  on public.class_students
  for each row execute function public.apply_attendance_quota();

create or replace function public.cancel_class_enrollments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    update public.class_students as cs
    set attendance_status = 'cancelled_teacher',
        updated_at = now()
    where cs.tenant_id = new.tenant_id
      and cs.class_id = new.id
      and cs.attendance_status <> 'cancelled_teacher';
  end if;
  return new;
end;
$$;

create trigger classes_cancel_enrollments
  after update of status on public.classes
  for each row execute function public.cancel_class_enrollments();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null,
  student_plan_id uuid,
  amount numeric(10, 2) not null check (amount >= 0),
  due_date date not null,
  status public.invoice_status not null default 'pending',
  offering_id text,
  student_name_snapshot text not null default '',
  reference_month date not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_month_start check (extract(day from reference_month) = 1),
  constraint invoices_tenant_id_unique unique (tenant_id, id),
  constraint invoices_student_month_unique unique (tenant_id, student_id, reference_month),
  constraint invoices_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  constraint invoices_student_plan_fk foreign key (tenant_id, student_plan_id)
    references public.student_plans (tenant_id, id) on delete restrict,
  constraint invoices_offering_fk foreign key (tenant_id, offering_id)
    references public.lesson_offerings (tenant_id, id) on delete restrict
);

create index invoices_tenant_status_due_idx
  on public.invoices (tenant_id, status, due_date);
create index invoices_tenant_reference_idx
  on public.invoices (tenant_id, reference_month desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  method public.payment_method not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint payments_invoice_fk foreign key (tenant_id, invoice_id)
    references public.invoices (tenant_id, id) on delete restrict
);

create index payments_tenant_date_idx on public.payments (tenant_id, payment_date desc);
create index payments_invoice_idx on public.payments (tenant_id, invoice_id);

create or replace function public.refresh_invoice_status(target_tenant_id uuid, target_invoice_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  invoice_amount numeric(10, 2);
  invoice_due_date date;
  amount_paid numeric(12, 2);
  next_status public.invoice_status;
begin
  select i.amount, i.due_date
  into invoice_amount, invoice_due_date
  from public.invoices as i
  where i.tenant_id = target_tenant_id and i.id = target_invoice_id;

  if not found then
    return;
  end if;

  select coalesce(sum(p.amount), 0)
  into amount_paid
  from public.payments as p
  where p.tenant_id = target_tenant_id and p.invoice_id = target_invoice_id;

  if amount_paid >= invoice_amount then
    next_status := 'paid';
  elsif invoice_due_date < current_date then
    next_status := 'late';
  else
    next_status := 'pending';
  end if;

  update public.invoices
  set status = next_status, updated_at = now()
  where tenant_id = target_tenant_id and id = target_invoice_id;
end;
$$;

create or replace function public.sync_payment_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.refresh_invoice_status(old.tenant_id, old.invoice_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.refresh_invoice_status(new.tenant_id, new.invoice_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger payments_sync_invoice
  after insert or update or delete on public.payments
  for each row execute function public.sync_payment_invoice_status();

-- Safe to run repeatedly for the same month. Schedule this function for day 1
-- in Supabase Cron and call it with the service role from a protected job.
create or replace function public.generate_monthly_records(target_month date)
returns table (invoices_created bigint, quotas_created bigint)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  month_start date := date_trunc('month', target_month)::date;
  last_day smallint;
begin
  if target_month is null or target_month <> month_start then
    raise exception 'target_month must be the first day of a month.'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.invoices as i
  set status = 'late', updated_at = now()
  where i.status = 'pending' and i.due_date < current_date;

  last_day := extract(day from (month_start + interval '1 month' - interval '1 day'))::smallint;

  with created as (
      insert into public.invoices (
        tenant_id, student_id, student_plan_id, amount, due_date, status, reference_month, student_name_snapshot
      )
      select sp.tenant_id,
             sp.student_id,
             sp.id,
             p.price,
             month_start + least(sp.due_day, last_day) - 1,
             'pending'::public.invoice_status,
             month_start,
             s.full_name
      from public.student_plans as sp
      join public.students as s
        on s.tenant_id = sp.tenant_id and s.id = sp.student_id
      join public.plans as p
        on p.tenant_id = sp.tenant_id and p.id = sp.plan_id
      where sp.is_current
        and sp.starts_on <= (month_start + interval '1 month' - interval '1 day')::date
        and (sp.ends_on is null or sp.ends_on >= month_start)
        and s.status = 'active'
        and s.archived_at is null
        and p.is_active
      on conflict (tenant_id, student_id, reference_month) do nothing
      returning 1
  )
  select count(*) into invoices_created from created;

  with created as (
      insert into public.invoices (
        tenant_id, student_id, offering_id, amount, due_date, status, reference_month, student_name_snapshot, description
      )
      select s.tenant_id,
             s.id,
             o.id,
             (o.price_cents * s.monthly_class_limit)::numeric
               / 100
               / case when o.price_unit = 'per_class' then coalesce(o.group_size, 1) else 1 end,
             month_start + least(5, last_day) - 1,
             'pending'::public.invoice_status,
             month_start,
             s.full_name,
             o.name || ' · ' || s.monthly_class_limit || ' aulas'
      from public.students as s
      join public.lesson_offerings as o
        on o.tenant_id = s.tenant_id and o.id = s.offering_id
      where s.archived_at is null
        and s.status = 'active'
        and s.monthly_class_limit is not null
        and o.kind = 'monthly'
        and o.active
      on conflict (tenant_id, student_id, reference_month) do nothing
      returning 1
  )
  select invoices_created + count(*) into invoices_created from created;

  with created as (
      insert into public.monthly_quotas (
        tenant_id, student_id, period_month, total_classes, used_classes
      )
      select sp.tenant_id, sp.student_id, month_start, p.classes_per_month, 0
      from public.student_plans as sp
      join public.students as s
        on s.tenant_id = sp.tenant_id and s.id = sp.student_id
      join public.plans as p
        on p.tenant_id = sp.tenant_id and p.id = sp.plan_id
      where sp.is_current
        and sp.starts_on <= (month_start + interval '1 month' - interval '1 day')::date
        and (sp.ends_on is null or sp.ends_on >= month_start)
        and s.status = 'active'
        and s.archived_at is null
        and p.is_active
      on conflict (tenant_id, student_id, period_month) do nothing
      returning 1
  )
  select count(*) into quotas_created from created;

  with created as (
      insert into public.monthly_quotas (
        tenant_id, student_id, period_month, total_classes, used_classes
      )
      select s.tenant_id, s.id, month_start, s.monthly_class_limit, 0
      from public.students as s
      join public.lesson_offerings as o
        on o.tenant_id = s.tenant_id and o.id = s.offering_id
      where s.archived_at is null
        and s.status = 'active'
        and s.monthly_class_limit is not null
        and o.kind = 'monthly'
        and o.active
      on conflict (tenant_id, student_id, period_month) do nothing
      returning 1
  )
  select quotas_created + count(*) into quotas_created from created;

  return next;
end;
$$;

revoke all on function public.generate_monthly_records(date) from public, anon, authenticated;
grant execute on function public.generate_monthly_records(date) to service_role;

create or replace function public.mark_late_invoices()
returns bigint
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  updated_count bigint;
begin
  update public.invoices as i
  set status = 'late', updated_at = now()
  where i.status = 'pending' and i.due_date < current_date;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_late_invoices() from public, anon, authenticated;
grant execute on function public.mark_late_invoices() to service_role;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp_phone text,
  email text,
  source text,
  interest text,
  status public.lead_status not null default 'new',
  notes text,
  converted_student_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_tenant_id_unique unique (tenant_id, id),
  constraint leads_student_fk foreign key (tenant_id, converted_student_id)
    references public.students (tenant_id, id) on delete restrict
);

create index leads_tenant_status_idx on public.leads (tenant_id, status, created_at desc);

create table public.trial_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid,
  converted_student_id uuid,
  guest_name text not null,
  guest_phone text,
  scheduled_at timestamptz not null,
  duration_minutes smallint not null default 60 check (duration_minutes between 15 and 240),
  court text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  status public.trial_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_classes_tenant_id_unique unique (tenant_id, id),
  constraint trial_classes_lead_fk foreign key (tenant_id, lead_id)
    references public.leads (tenant_id, id) on delete restrict,
  constraint trial_classes_student_fk foreign key (tenant_id, converted_student_id)
    references public.students (tenant_id, id) on delete restrict
);

create index trial_classes_tenant_date_idx on public.trial_classes (tenant_id, scheduled_at);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind public.message_template_kind not null,
  message_body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_tenant_kind_unique unique (tenant_id, kind),
  constraint message_templates_tenant_id_unique unique (tenant_id, id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid,
  invoice_id uuid,
  template_id uuid,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  destination_phone text not null,
  rendered_body text not null,
  opened_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_tenant_id_unique unique (tenant_id, id),
  constraint messages_student_fk foreign key (tenant_id, student_id)
    references public.students (tenant_id, id) on delete restrict,
  constraint messages_invoice_fk foreign key (tenant_id, invoice_id)
    references public.invoices (tenant_id, id) on delete restrict,
  constraint messages_template_fk foreign key (tenant_id, template_id)
    references public.message_templates (tenant_id, id) on delete restrict
);

create index messages_tenant_created_idx on public.messages (tenant_id, created_at desc);

-- Account bootstrap: profile and initial settings are created on Supabase Auth sign-up.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_tenant_for_new_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
create trigger students_set_updated_at before update on public.students
  for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger lesson_offerings_set_updated_at before update on public.lesson_offerings
  for each row execute function public.set_updated_at();
create trigger student_plans_set_updated_at before update on public.student_plans
  for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.classes
  for each row execute function public.set_updated_at();
create trigger monthly_quotas_set_updated_at before update on public.monthly_quotas
  for each row execute function public.set_updated_at();
create trigger class_students_set_updated_at before update on public.class_students
  for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger trial_classes_set_updated_at before update on public.trial_classes
  for each row execute function public.set_updated_at();
create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.students enable row level security;
alter table public.plans enable row level security;
alter table public.lesson_offerings enable row level security;
alter table public.student_plans enable row level security;
alter table public.classes enable row level security;
alter table public.monthly_quotas enable row level security;
alter table public.class_students enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.leads enable row level security;
alter table public.trial_classes enable row level security;
alter table public.message_templates enable row level security;
alter table public.messages enable row level security;

create policy "tenant owner can view tenant" on public.tenants
  for select to authenticated using (id = public.current_tenant_id());

create policy "user can manage own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()) and tenant_id = public.current_tenant_id())
  with check (id = (select auth.uid()) and tenant_id = public.current_tenant_id());

create policy "tenant can manage settings" on public.settings
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage students" on public.students
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage plans" on public.plans
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage lesson offerings" on public.lesson_offerings
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage student plans" on public.student_plans
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage classes" on public.classes
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage monthly quotas" on public.monthly_quotas
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage class students" on public.class_students
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage invoices" on public.invoices
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage payments" on public.payments
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage leads" on public.leads
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage trial classes" on public.trial_classes
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage message templates" on public.message_templates
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant can manage messages" on public.messages
  for all to authenticated using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Grants let Supabase's authenticated role reach these tables; RLS limits rows.
grant select, insert, update, delete on
  public.profiles, public.settings, public.students, public.plans, public.lesson_offerings,
  public.student_plans, public.classes, public.monthly_quotas, public.class_students,
  public.invoices, public.payments, public.leads, public.trial_classes,
  public.message_templates, public.messages
to authenticated;
grant select on public.tenants to authenticated;

-- Keep internal trigger functions unavailable as direct PostgREST RPC calls.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.create_tenant_for_new_user() from public, anon, authenticated;
revoke all on function public.enforce_class_capacity() from public, anon, authenticated;
revoke all on function public.enforce_class_capacity_limit() from public, anon, authenticated;
revoke all on function public.apply_attendance_quota() from public, anon, authenticated;
revoke all on function public.cancel_class_enrollments() from public, anon, authenticated;
revoke all on function public.refresh_invoice_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_payment_invoice_status() from public, anon, authenticated;
