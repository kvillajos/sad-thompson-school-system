-- v54-subject-codes.sql
-- Readable subject codes (subject_code is only a label; grades and history match on subject_name).
--   21CLIT -> LIT21, III -> INQUIRY, KPWKP -> KOMPAN
-- Safe to run twice: an already-renamed code matches no row.
begin;
update subjects set subject_code = 'LIT21' where subject_code = '21CLIT';
update subjects set subject_code = 'INQUIRY' where subject_code = 'III';
update subjects set subject_code = 'KOMPAN' where subject_code = 'KPWKP';
commit;
