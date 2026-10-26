-- v48-student-school-years.sql
-- Track student enrollment separately for each school year.

BEGIN;

-- =========================================================
-- 1. CREATE STUDENT SCHOOL-YEAR TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.student_school_years (
    student_id INTEGER NOT NULL
        REFERENCES public.students(student_id)
        ON DELETE CASCADE,

    school_year TEXT NOT NULL
        CHECK (school_year ~ '^[0-9]{4}-[0-9]{4}$'),

    grade_level INTEGER,

    section_id INTEGER
        REFERENCES public.sections(section_id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (student_id, school_year)
);

-- =========================================================
-- 2. ENABLE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.student_school_years
    ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.student_school_years
TO authenticated;

-- Role 1 is Admin and role 2 is Registrar, matching the application role guards.
DROP POLICY IF EXISTS student_school_years_admin_registrar_select
ON public.student_school_years;
CREATE POLICY student_school_years_admin_registrar_select
ON public.student_school_years
FOR SELECT
TO authenticated
USING (
    (SELECT current_app_role()) = ANY (ARRAY[1, 2])
);

DROP POLICY IF EXISTS student_school_years_admin_registrar_insert
ON public.student_school_years;
CREATE POLICY student_school_years_admin_registrar_insert
ON public.student_school_years
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT current_app_role()) = ANY (ARRAY[1, 2])
);

DROP POLICY IF EXISTS student_school_years_admin_registrar_update
ON public.student_school_years;
CREATE POLICY student_school_years_admin_registrar_update
ON public.student_school_years
FOR UPDATE
TO authenticated
USING (
    (SELECT current_app_role()) = ANY (ARRAY[1, 2])
)
WITH CHECK (
    (SELECT current_app_role()) = ANY (ARRAY[1, 2])
);

DROP POLICY IF EXISTS student_school_years_admin_registrar_delete
ON public.student_school_years;
CREATE POLICY student_school_years_admin_registrar_delete
ON public.student_school_years
FOR DELETE
TO authenticated
USING (
    (SELECT current_app_role()) = ANY (ARRAY[1, 2])
);

DROP POLICY IF EXISTS student_school_years_student_select
ON public.student_school_years;
CREATE POLICY student_school_years_student_select
ON public.student_school_years
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.users u
        WHERE lower(u.email::text) =
              lower(auth.jwt() ->> 'email')
          AND u.student_id =
              student_school_years.student_id
    )
);

-- =========================================================
-- 3. BACKFILL THE CURRENT SCHOOL YEAR
-- =========================================================

-- The school year runs from June through May.
-- October falls within the school year that began in June of that calendar year.
WITH current_sy AS (
    SELECT
        CASE
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 6
            THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
            ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
        END AS start_year
)
INSERT INTO public.student_school_years (
    student_id,
    school_year,
    grade_level,
    section_id
)
SELECT
    s.student_id,
    current_sy.start_year::TEXT
        || '-'
        || (current_sy.start_year + 1)::TEXT,
    s.grade_level,
    NULL
FROM public.students s
CROSS JOIN current_sy
WHERE s.enrollment_status = 'Enrolled'
ON CONFLICT (student_id, school_year)
DO NOTHING;

-- =========================================================
-- 4. BACKFILL HISTORICAL ENROLLMENT YEARS
-- =========================================================

-- Include completed and inactive enrollments: these rows record enrollment history,
-- not only current status. If multiple enrollments resolve to one year, retain the latest.
WITH historical_enrollments AS (
    SELECT DISTINCT ON (
        e.student_id,
        COALESCE(NULLIF(s.academic_year, ''), e.school_year)
    )
        e.student_id,
        COALESCE(NULLIF(s.academic_year, ''), e.school_year) AS school_year,
        e.grade_level,
        e.section_id,
        e.enrolled_at,
        e.id
    FROM public.enrollments e
    LEFT JOIN public.sections s
        ON s.section_id = e.section_id
    ORDER BY
        e.student_id,
        COALESCE(NULLIF(s.academic_year, ''), e.school_year),
        e.enrolled_at DESC NULLS LAST,
        e.id DESC
)
INSERT INTO public.student_school_years (
    student_id,
    school_year,
    grade_level,
    section_id
)
SELECT
    student_id,
    school_year,
    grade_level,
    section_id
FROM historical_enrollments
ON CONFLICT (student_id, school_year)
DO UPDATE SET
    grade_level = EXCLUDED.grade_level,
    section_id = EXCLUDED.section_id;

-- =========================================================
-- 5. CREATE ENROLLMENT TRIGGER FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_student_school_year()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    section_school_year TEXT;
BEGIN
    -- Only synchronize active enrollments.
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    -- Prefer the academic year assigned to the section.
    IF NEW.section_id IS NOT NULL THEN
        SELECT s.academic_year
        INTO section_school_year
        FROM public.sections s
        WHERE s.section_id = NEW.section_id;
    END IF;

    -- Fall back to the enrollment's school year if
    -- the enrollment does not have a matching section.
    IF section_school_year IS NULL THEN
        section_school_year := NEW.school_year;
    END IF;

    INSERT INTO public.student_school_years (
        student_id,
        school_year,
        grade_level,
        section_id
    )
    VALUES (
        NEW.student_id,
        section_school_year,
        NEW.grade_level,
        NEW.section_id
    )
    ON CONFLICT (student_id, school_year)
    DO UPDATE SET
        grade_level = EXCLUDED.grade_level,
        section_id = EXCLUDED.section_id;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_student_school_year()
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.sync_student_school_year()
    FROM PUBLIC, anon, authenticated;

-- =========================================================
-- 6. ATTACH TRIGGER TO ENROLLMENTS
-- =========================================================

DROP TRIGGER IF EXISTS sync_student_school_year_trigger
ON public.enrollments;

CREATE TRIGGER sync_student_school_year_trigger
AFTER INSERT OR UPDATE OF
    student_id,
    school_year,
    grade_level,
    section_id,
    status
ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_school_year();

COMMIT;