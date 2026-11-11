-- v65-calendar-seed.sql  (branch SchoolYearLifecycle)
-- Calendar data for 2024-2025, 2025-2026 and 2026-2027 (Year Setup > Calendar tab), all empty before this.
--   Quarters: June to March, matching the school_days months already stored. Q1-Q2 = 1st semester, Q3-Q4 = 2nd.
--   Grade deadline: about a week after each quarter ends.
--   Holidays: Philippine regular and special non-working days, plus Araw ng Dabaw (Davao City, March 16).
--   Islamic holidays are fixed each year by proclamation; dates marked "est." are estimates to correct on the page.
-- school_days is left as it is. Run as the database owner: no auth.uid(), so the Past-year lock lets it through.
-- Inserts only, never overwrites: safe to run twice, and edits made on the page survive a re-run.
begin;

insert into public.school_quarters (school_year, quarter, start_date, end_date, grade_deadline) values
  ('2024-2025', 1, '2024-06-03', '2024-08-09', '2024-08-16'),
  ('2024-2025', 2, '2024-08-12', '2024-10-25', '2024-10-31'),
  ('2024-2025', 3, '2024-11-04', '2025-01-24', '2025-01-31'),
  ('2024-2025', 4, '2025-01-27', '2025-03-28', '2025-04-04'),
  ('2025-2026', 1, '2025-06-02', '2025-08-08', '2025-08-15'),
  ('2025-2026', 2, '2025-08-11', '2025-10-24', '2025-10-30'),
  ('2025-2026', 3, '2025-11-03', '2026-01-23', '2026-01-30'),
  ('2025-2026', 4, '2026-01-26', '2026-03-27', '2026-03-31'),
  ('2026-2027', 1, '2026-06-01', '2026-08-07', '2026-08-14'),
  ('2026-2027', 2, '2026-08-10', '2026-10-23', '2026-10-30'),
  ('2026-2027', 3, '2026-11-03', '2027-01-22', '2027-01-29'),
  ('2026-2027', 4, '2027-01-25', '2027-03-24', '2027-03-31')
on conflict (school_year, quarter) do nothing;

insert into public.school_holidays (school_year, holiday_date, name) values
  -- 2024-2025
  ('2024-2025', '2024-06-12', 'Independence Day'),
  ('2024-2025', '2024-06-17', 'Eid''l Adha'),
  ('2024-2025', '2024-08-21', 'Ninoy Aquino Day'),
  ('2024-2025', '2024-08-26', 'National Heroes Day'),
  ('2024-2025', '2024-11-01', 'All Saints'' Day'),
  ('2024-2025', '2024-11-02', 'All Souls'' Day'),
  ('2024-2025', '2024-11-30', 'Bonifacio Day'),
  ('2024-2025', '2024-12-08', 'Feast of the Immaculate Conception'),
  ('2024-2025', '2024-12-24', 'Christmas Eve'),
  ('2024-2025', '2024-12-25', 'Christmas Day'),
  ('2024-2025', '2024-12-30', 'Rizal Day'),
  ('2024-2025', '2024-12-31', 'Last Day of the Year'),
  ('2024-2025', '2025-01-01', 'New Year''s Day'),
  ('2024-2025', '2025-01-29', 'Chinese New Year'),
  ('2024-2025', '2025-03-16', 'Araw ng Dabaw'),
  ('2024-2025', '2025-04-01', 'Eid''l Fitr'),
  ('2024-2025', '2025-04-09', 'Araw ng Kagitingan'),
  ('2024-2025', '2025-04-17', 'Maundy Thursday'),
  ('2024-2025', '2025-04-18', 'Good Friday'),
  ('2024-2025', '2025-04-19', 'Black Saturday'),
  ('2024-2025', '2025-05-01', 'Labor Day'),
  ('2024-2025', '2025-05-12', 'National and Local Elections'),
  -- 2025-2026
  ('2025-2026', '2025-06-06', 'Eid''l Adha'),
  ('2025-2026', '2025-06-12', 'Independence Day'),
  ('2025-2026', '2025-08-21', 'Ninoy Aquino Day'),
  ('2025-2026', '2025-08-25', 'National Heroes Day'),
  ('2025-2026', '2025-10-31', 'All Saints'' Day Eve'),
  ('2025-2026', '2025-11-01', 'All Saints'' Day'),
  ('2025-2026', '2025-11-30', 'Bonifacio Day'),
  ('2025-2026', '2025-12-08', 'Feast of the Immaculate Conception'),
  ('2025-2026', '2025-12-24', 'Christmas Eve'),
  ('2025-2026', '2025-12-25', 'Christmas Day'),
  ('2025-2026', '2025-12-30', 'Rizal Day'),
  ('2025-2026', '2025-12-31', 'Last Day of the Year'),
  ('2025-2026', '2026-01-01', 'New Year''s Day'),
  ('2025-2026', '2026-02-17', 'Chinese New Year'),
  ('2025-2026', '2026-03-16', 'Araw ng Dabaw'),
  ('2025-2026', '2026-03-20', 'Eid''l Fitr (est.)'),
  ('2025-2026', '2026-04-02', 'Maundy Thursday'),
  ('2025-2026', '2026-04-03', 'Good Friday'),
  ('2025-2026', '2026-04-04', 'Black Saturday'),
  ('2025-2026', '2026-04-09', 'Araw ng Kagitingan'),
  ('2025-2026', '2026-05-01', 'Labor Day'),
  ('2025-2026', '2026-05-27', 'Eid''l Adha (est.)'),
  -- 2026-2027
  ('2026-2027', '2026-06-12', 'Independence Day'),
  ('2026-2027', '2026-08-21', 'Ninoy Aquino Day'),
  ('2026-2027', '2026-08-31', 'National Heroes Day'),
  ('2026-2027', '2026-11-01', 'All Saints'' Day'),
  ('2026-2027', '2026-11-02', 'All Souls'' Day'),
  ('2026-2027', '2026-11-30', 'Bonifacio Day'),
  ('2026-2027', '2026-12-08', 'Feast of the Immaculate Conception'),
  ('2026-2027', '2026-12-24', 'Christmas Eve'),
  ('2026-2027', '2026-12-25', 'Christmas Day'),
  ('2026-2027', '2026-12-30', 'Rizal Day'),
  ('2026-2027', '2026-12-31', 'Last Day of the Year'),
  ('2026-2027', '2027-01-01', 'New Year''s Day'),
  ('2026-2027', '2027-02-06', 'Chinese New Year'),
  ('2026-2027', '2027-03-10', 'Eid''l Fitr (est.)'),
  ('2026-2027', '2027-03-16', 'Araw ng Dabaw'),
  ('2026-2027', '2027-03-25', 'Maundy Thursday'),
  ('2026-2027', '2027-03-26', 'Good Friday'),
  ('2026-2027', '2027-03-27', 'Black Saturday'),
  ('2026-2027', '2027-04-09', 'Araw ng Kagitingan'),
  ('2026-2027', '2027-05-01', 'Labor Day'),
  ('2026-2027', '2027-05-17', 'Eid''l Adha (est.)')
on conflict (school_year, holiday_date) do nothing;

commit;
