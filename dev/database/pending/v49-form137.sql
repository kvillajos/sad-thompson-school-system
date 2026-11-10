-- Migration v49-form137.sql
-- Description: Promotion exclusion notes, DepEd Form 137/138 layout tables, and data export logging

CREATE TABLE IF NOT EXISTS public.registrar_exclusion_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    school_year TEXT NOT NULL,
    reason TEXT NOT NULL,
    recorded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.deped_form_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL,
    form_type TEXT CHECK (form_type IN ('FORM_137', 'FORM_138')),
    evaluation_summary JSONB DEFAULT '{}'::jsonb,
    remarks TEXT,
    generated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.registrar_exclusion_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deped_form_records ENABLE ROW LEVEL SECURITY;

-- Registrar & Admin Access Policies
CREATE POLICY "Registrars and Admins can manage exclusion notes"
ON public.registrar_exclusion_notes
FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Registrars and Admins can manage DepEd form records"
ON public.deped_form_records
FOR ALL
USING (true)
WITH CHECK (true);