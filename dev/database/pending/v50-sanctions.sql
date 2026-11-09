-- ============================================================
-- V50: Student Sanctions and Disciplinary Records
-- ============================================================

create table if not exists student_sanctions (
  sanction_id serial primary key,

  student_id integer not null
    references students(student_id)
    on delete cascade,

  incident_date date not null default current_date,

  violation_type text not null,

  description text not null,

  sanction_type text not null,

  sanction_details text,

  status text not null default 'active'
    check (status in ('active', 'resolved', 'dismissed')),

  issued_by integer
    references users(user_id)
    on delete set null,

  resolution_notes text,

  resolved_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index if not exists idx_student_sanctions_student
  on student_sanctions(student_id);

create index if not exists idx_student_sanctions_status
  on student_sanctions(status);

create index if not exists idx_student_sanctions_incident_date
  on student_sanctions(incident_date desc);