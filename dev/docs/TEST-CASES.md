# Test Cases: Team Merge and School-Year Lifecycle

These cases cover the four merged team branches (Sam, Khyle, Angela, John) and the school-year lifecycle features from `SchoolYearLifecycle`. Each person owns one part. Work through your cases in order, tick **Pass** or **Fail**, and write what you saw under **Notes** whenever something is off.

---

## Before you start

1. **Where:** the live site, after `SchoolYearLifecycle` is merged into `main` and deployed.
2. **Test data is real.** Everyone shares the live database.
   - Give everything you create a name starting with **TEST** (e.g. "TEST Juan Dela Cruz").
   - Only close or reopen **2027-2028**, which Jash creates in 5.a. **Never close 2026-2027.**
3. **Hand-offs.** Some steps need another person. They are marked **→ Name**. Message that person when you reach the step.
4. **Suggested order:**
   - Jash starts with 5.a-5.c (the new year must exist first).
   - Everyone else can start right away.
   - Promotion (4.d) and closing a year (5.d) come last.
5. **Fail?** Write down the page, what you clicked, and the error message, and take a screenshot. Send it to the lead.

Each case uses this shape:

> **You are** the role you sign in as, and what you are trying to do.
> **Steps** to follow. **Expected** is what should happen.
> `[ ] Pass  [ ] Fail` · **Notes:**

---

## 1. Sam: Admin reports, admissions, discipline

### 1.a Generate reports
**You are** the admin preparing reports for the principal.

**Steps**
1. Open **Reports**.
2. Choose **Master Class List**, then **Generate Report**.
3. Change the School Year, Grade Level and Section filters, and generate again.
4. Repeat steps 2-3 with **Section Summary** and **School Statistics**.
5. Press **Print Report**.

**Expected**
- Each report shows only the students matching the filters.
- Totals match the filtered rows.
- LRNs are shown in full.
- Print opens the print dialog with the report only.

`[ ] Pass  [ ] Fail` · **Notes:**

### 1.b Reject an application
**You are** the admin turning down an incomplete application.

**Steps**
1. **→ John:** submit a TEST application through **New Admission**.
2. Open the **Dashboard**. Under **Pending Approvals**, find the **Admission** row and press **Open Admissions**.
3. On **Admissions**, press **Review** on the TEST application.
4. Without ticking the three **Before you decide** checks, try **Decline**.
5. Tick all three checks. Leave **Remarks** empty and press **Decline**.
6. Enter a reason in **Remarks**, then press **Decline** and confirm.

**Expected**
- After step 2, the Dashboard shows one Admission row with the number waiting, not one row per application.
- In step 4, **Approve** and **Decline** stay greyed out until all three checks are ticked.
- Step 5 is refused because a reason is required.
- After step 6, the application leaves **Applications Awaiting Review**, and its status shows Rejected for the registrar.

`[ ] Pass  [ ] Fail` · **Notes:**

### 1.c Edit the required documents list
**You are** the admin updating the documents a new student must submit.

**Steps**
1. **Admissions** → **Required documents**.
2. **Edit** one item: change its grades or switch it to Optional, then save.
3. **+ Add item**: add "TEST Medical certificate", Required, all grades.
4. Turn off "TEST Medical certificate".
5. **→ John:** open a new application's **Requirements**.

**Expected**
- Each change saves.
- The registrar's checklist shows the change from step 2.
- It shows the TEST item after step 3 and stops showing it after step 4.

`[ ] Pass  [ ] Fail` · **Notes:**

### 1.d Approve an application that is missing a document
**You are** the admin, and a student's PSA birth certificate will arrive late.

**Steps**
1. Try to approve a TEST application with a required document missing.
2. **→ John:** request an override for it (4.i).
3. **Dashboard** → **Pending Approvals**: approve the **Requirements override**.
4. Approve the application again.

**Expected**
- Step 1 is blocked with a message naming the missing document.
- After step 3, the application approves.
- The student record and enrollment are created.

`[ ] Pass  [ ] Fail` · **Notes:**

### 1.e Record a discipline case
**You are** the admin logging an incident.

**Steps**
1. Open **Discipline** and type a TEST student's name (use Angela's test student, see 3.d).
2. **+ Add record**: enter a type, the date and a description, then save.
3. **Edit** the record: set it to **Resolved** and add a note.
4. **→ Angela:** check the student's Discipline Record card.

**Expected**
- The record appears in the list.
- The status change saves.
- The student sees the record read-only, with the updated status.

`[ ] Pass  [ ] Fail` · **Notes:**

### 1.f Every admin page opens (regression)
**You are** the admin checking that nothing is broken after the merge.

**Steps**
1. Open every link in the admin navigation, one by one:
   - Dashboard, then **Manage** (click it to open): Accounts, Faculty, Sections, Subjects, Schedules
   - School Years (both tabs: Setup & closing, Calendar), Grade Tracker, Discipline, Admissions, Reports & Audit (both tabs)
   - On **Reports & Audit** → **Audit Trail** tab, also scroll to **Restore Changes**
2. Open the browser console (F12) on each page.

**Expected**
- Every page loads.
- The navigation shows on every page.
- No red errors appear in the console.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 2. Khyle: Faculty grades, attendance, advisory

### 2.a Bulk upload with the editable grid
**You are** a teacher uploading a class's quarter grades from a spreadsheet.

**Steps**
1. Open **Grades**, pick one of your classes, press **Upload spreadsheet**, and download the template.
2. Fill it in, and make one row wrong (a score of 120, or a blank name).
3. Upload it.
4. Fix the bad cell in the grid on screen.
5. Save.

**Expected**
- After step 3, the grid shows every row and marks the bad one.
- Saving is refused while a bad row is left.
- After step 4, it saves, and **Grades** shows the uploaded scores.

`[ ] Pass  [ ] Fail` · **Notes:**

### 2.b Attendance draft
**You are** a teacher whose browser closes halfway through taking attendance.

**Steps**
1. Open **Attendance**, choose a class and today's date.
2. Mark two students Absent and one Late. **Do not save.**
3. Reload the page and pick the same class and date.
4. Press **Restore draft**.
5. Repeat steps 2-3, then press **Discard draft**.

**Expected**
- After step 4, the three marks come back.
- After step 5, the marks are cleared.
- Nothing is saved to the database until **Save Attendance** is pressed.

`[ ] Pass  [ ] Fail` · **Notes:**

### 2.c Save and lock grades
**You are** a teacher finishing a quarter.

**Steps**
1. **Grades** → choose a class → type the scores → **Save Grades**.
2. **Submit & Lock**.
3. Try to change a locked score.
4. Use **Request correction** on one score with a reason.
5. **→ Sam:** approve it on the Dashboard.

**Expected**
- Step 3 is not possible: the fields are locked.
- After step 5, the corrected score shows.

`[ ] Pass  [ ] Fail` · **Notes:**

### 2.d Grade tracker shows your class
**You are** a teacher, and the admin is checking who has not submitted.

**Steps**
1. **→ Sam:** open **Grade Tracker** with the year and quarter from 2.c.
2. Find your class.
3. Find a class with no grades whose quarter deadline (from 5.b, or the current year's calendar) has passed.

**Expected**
- Your class from 2.c shows as complete.
- The class with no grades and a passed deadline shows **Late**.
- A class whose deadline has not passed is not Late.

`[ ] Pass  [ ] Fail` · **Notes:**

### 2.e My Advisory
**You are** a section adviser checking on your whole class.

**Steps**
1. **→ Sam:** **Manage Sections** → edit a section → set you as the moderator (adviser).
2. Sign in again and open **My Advisory**.
3. Look at the grades (every subject), the attendance, the requests and Discipline.
4. **Discipline** → type one of your advisory students → **+ Add record** → save.

**Expected**
- Every subject's grades show for the section, not only yours.
- The attendance and the students' requests are listed.
- The discipline record saves, and the admin sees it on **Discipline**.

`[ ] Pass  [ ] Fail` · **Notes:**

### 2.f No access to another section
**You are** an adviser trying to look at a section you don't advise.

**Steps**
1. On **My Advisory**, check which students are listed.
2. Try adding a discipline record for a student from another section.

**Expected**
- Only your advisory section's students appear.
- Step 2 is not possible, or it is refused.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 3. Angela: Student portal

Use one TEST student login (ask Sam or John for one, or use a student from 4.c), and tell Sam its name for 1.e.

### 3.a Historical records
**You are** a student checking last year's grades.

**Steps**
1. Open **History** (**Historical Academic Records**).
2. Change the school year filter, including **All school years**.

**Expected**
- Past years' grades show, grouped by year.
- The filter shows only the chosen year.
- A student with no past years sees a clear empty message.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.b Requests portal
**You are** a student whose LRN is wrong and who wants a section transfer.

**Steps**
1. **Requests** → **Submit a Request**.
2. Choose **LRN update**, enter the details, then **Submit request**.
3. Submit a **Section transfer** request.
4. **→ Sam:** approve one request and reject the other.
5. Check **My Requests**.

**Expected**
- Both requests show as Pending after you submit them.
- After step 4, one shows Approved and the other Rejected.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.c Document requests
**You are** a student who needs a Form 137, a Good Moral certificate and a Certificate of Enrollment.

**Steps**
1. **Requests** → **Request a Document**.
2. Request a Form 137, a Good Moral certificate and a COE.
3. **→ John:** process them (4.h).
4. Watch the status and your notifications after each of John's steps.

**Expected**
- Each request moves Pending → Approved → Ready for pickup → Released.
- The one John rejects shows Rejected with his reason.
- You get a notification at each step.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.d Discipline record
**You are** a student checking your record.

**Steps**
1. After **Sam's** 1.e, open the Dashboard → **Discipline Record**.

**Expected**
- Sam's record shows with its type, date and status (Resolved).
- There are no edit or delete buttons.
- A student with no records sees an empty message.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.e Unofficial transcript
**You are** a student who needs a copy of their grades.

**Steps**
1. **Transcript** → **View PDF**.

**Expected**
- A PDF opens with the student's name, LRN and every year's grades.
- It is marked unofficial.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.f Profile edit request
**You are** a student whose address has changed.

**Steps**
1. **Profile** → **Request edit** → change the address → **Submit request**.
2. **→ Sam:** find it on the Dashboard.

**Expected**
- The request reaches the admin.
- After the admin approves it, the new address shows on the profile.

`[ ] Pass  [ ] Fail` · **Notes:**

### 3.g Graduate login
**You are** a student who graduated in **John's** 4.d.

**Steps**
1. Sign in with the graduated student's login.
2. Look through the navigation and the dashboard.
3. Request a Form 137.

**Expected**
- Only the transcript and document requests are available.
- Grades entry, schedule and other current-year panels are hidden.
- The Form 137 request goes through.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 4. John: Registrar promotion, records, documents

### 4.a Active and historical students, Quick View
**You are** the registrar looking up a student.

**Steps**
1. Open **Students** → **Directory**. Switch between the current, **Not re-enrolled** and historical or all views.
2. Click a student to open the Quick View.

**Expected**
- Active students and past students are kept apart.
- The Quick View shows the current enrollment, section, GPA and promotion history.
- It closes with the × button or Escape.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.b Promotion subject results
**You are** the registrar checking who is eligible to move up.

**Steps**
1. Open **Promotion & Transfers** and choose a grade level.
2. Find a student with a failing subject and press **View subject breakdown**.

**Expected**
- Each subject shows its grade.
- The failing subject is marked.
- A student with no grades shows "No grades yet".

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.c Bulk import
**You are** the registrar adding new students from a spreadsheet.

**Steps**
1. **Bulk Import** → **Download template**.
2. Fill in 3 TEST students for the current year, and make a 4th row bad (no LRN, or a wrong date).
3. Choose the file.
4. Fix the bad row in the file, choose it again, then **Import**.
5. **→ Sam:** **Manage Accounts** → **Provision pending logins**.
6. Sign in as one imported student with *username*123.

**Expected**
- After step 3, the preview marks the bad row "Fix" and **Import** is not allowed.
- After step 4, three students are created as Enrolled.
- After step 6, the login works.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.d Batch promotion and graduation (do this last)
**You are** the registrar promoting Grade 12 at the end of the year.

Promotion runs on a whole grade level. **Exclude everyone except the 2 students you are testing**, or real students will be promoted too.

**Steps**
1. **Promotion & Transfers** → Grade 12.
2. In the exclude list, tick every student except:
   - one student who passed every subject
   - one student with a failing subject
3. Request the batch promotion.
4. **→ Sam:** approve it on the Dashboard.
5. Open **Graduation**.
6. Repeat with Grade 10, again for just one passing student.

**Expected**
- The passing Grade 12 student becomes Graduated and is listed under Graduation.
- The failing Grade 12 student is Retained.
- The Grade 10 student is listed as a completer, moves to Grade 11, and stays active.
- Excluded students are unchanged.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.e Bulk import is blocked while enrollment is closed
**You are** the registrar trying to add students to a year that isn't open.

**Steps**
1. **→ Jash:** make sure 2027-2028 enrollment is closed (5.c).
2. **Bulk Import** a TEST row for 2027-2028.

**Expected**
- The import is refused with a message that enrollment is closed.
- After Jash opens enrollment, the same import works.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.f Report cards for a section
**You are** the registrar printing report cards for a whole class.

**Steps**
1. **Section Reports** → choose the year and a section → **Print report cards**.
2. Print, then download the PDF.

**Expected**
- One report card per student, each on its own page.
- Grades, monthly attendance and the adviser are filled in.
- The PDF matches the print.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.g DepEd School Forms
**You are** the registrar exporting the forms DepEd asks for.

**Steps**
1. **Section Reports** → choose a section.
2. Download **SF1**, **SF2** (choose a month), **SF5** and **SF10** (for one student).
3. Open each file in Excel.

**Expected**
- Each file is an .xlsx that opens without a repair warning.
- SF1 lists the section's students.
- SF2 shows that month's school days and absences.
- SF5 shows promotion results.
- SF10 shows the student's grades by year.
- The School ID and district are blank for now (known, waiting on the school's details).

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.h Handle document requests
**You are** the registrar processing Angela's requests from 3.c.

**Steps**
1. Open **Document Requests**.
2. **Approve** the Form 137 → **Ready for pickup** → **Released**.
3. Do the same for the COE.
4. **Reject** the Good Moral request, first with no reason, then with a reason.

**Expected**
- Each status change saves, and Angela sees it.
- A rejection without a reason is refused.

`[ ] Pass  [ ] Fail` · **Notes:**

### 4.i Requirements checklist and override
**You are** the registrar handling paper documents and a late PSA.

**Steps**
1. **Applications** → open a TEST application → **Requirements**.
2. Tick the documents you "received" on paper, leaving PSA unticked.
3. Upload a file into one of the document fields (Good Moral, Form 137 or JHS completion).
4. **Request override** with no reason, then with "PSA to follow by July 15".
5. **→ Sam:** approve it (1.d).

**Expected**
- The ticks save and the Requirements column updates.
- An override without a reason is refused.
- After Sam approves the override, the application can be approved.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 5. Jash: School-year setup and closing

### 5.a School Years setup
**You are** the admin preparing the next school year.

**Steps**
1. **School Years** → **+ Add school year**. It is prefilled with 2027-2028 (June 1, 2027 to May 31, 2028). Press **Add school year**.
2. Step 1: copy sections and timetables from 2026-2027.
3. Step 2: carry over lunch times and the grading scale.
4. Steps 3-4: set the school days (after 5.b) and assign advisers.
5. Run the copy again.

**Expected**
- Each step turns green when done.
- The copied sections show in **Manage Sections** under 2027-2028, with no students.
- Step 5 creates no duplicates.

`[ ] Pass  [ ] Fail` · **Notes:**

### 5.b School Calendar
**You are** the admin entering 2027-2028's calendar.

**Steps**
1. **School Years** → click the **2027-2028** card → **Calendar** tab.
2. Enter all four quarters' start, end and grade deadline, then **Save quarters**.
3. Try saving a quarter that ends before it starts, or one that overlaps another.
4. Add two holidays on weekdays.
5. **Compute from calendar**.
6. Open **Manage Subjects** → school days.

**Expected**
- Step 3 is refused with a clear message.
- The school days per month equal the weekdays minus the holidays.
- The numbers can still be edited on Manage Subjects.

`[ ] Pass  [ ] Fail` · **Notes:**

### 5.c Open and close enrollment
**You are** the admin controlling when enrollment for a year is allowed.

**Steps**
1. **School Years** → click the **2027-2028** card → step 5. Leave enrollment **closed**.
2. **→ John:** open **Manage Enrollment** for 2027-2028, then try to enroll or re-enroll a TEST student.
3. **Open enrollment**, and John tries again.
4. **Close enrollment** again.

**Expected**
- While enrollment is closed, the banner shows Closed and enrolling is refused.
- After step 3, it shows Open and enrolling works.
- Moving students who are already placed still works while it is closed.

`[ ] Pass  [ ] Fail` · **Notes:**

### 5.d Year-end checklist and Close year (do this last)
**You are** the admin closing 2027-2028. **Never use 2026-2027 here.**

**Steps**
1. **School Years** → click the **2027-2028** card → **End of 2027-2028**.
2. Read the checklist: grades submitted, promotion done, open requests.
3. Try **Close**.
4. **Close anyway…**: first without a reason, then with "TEST close".
5. **→ Khyle and John:** try to edit anything in 2027-2028 (a grade, an enrollment).
6. **Reopen year**.

**Expected**
- The checklist lists the open items, and **Close** is not allowed while any are open.
- **Close anyway…** needs a reason.
- After step 4, the year shows Past, and the edits in step 5 are refused.
- After step 6, the year is open again and edits work.

`[ ] Pass  [ ] Fail` · **Notes:**

### 5.e "How do I…" help
**You are** someone new to the system, looking for instructions.

**Steps**
1. Sign in as each role: admin, registrar, faculty, student. Ask the others for a turn, or use their logins.
2. Open the menu with your name (top right) → **How do I…**.
3. Search "enrollment", then "report card", then "zzz".
4. Close it with ×, and by clicking outside the window.

**Expected**
- Each role sees only its own guides.
- Search shows the matching guides, opened.
- "zzz" shows "No matching guide."
- The page and button names in the guides match the real screens.

`[ ] Pass  [ ] Fail` · **Notes:**

### 5.f Current year untouched (regression)
**You are** the admin making sure the live year is still normal after all the tests.

**Steps**
1. **School Years** → click the **2026-2027** card.
2. **→ John:** open **Manage Enrollment** for 2026-2027.

**Expected**
- 2026-2027 shows **Active**.
- Enrollment is **Open**.
- It is not closed.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## Cleanup (everyone, after all tests)

1. Delete your TEST records: students, applications, sanctions, requests, the required-documents item.
   - Or undo them in **Restore Changes** (it covers the last 30 days).
2. **John:** undo the 4.d promotion of real students in **Restore Changes** if they should not stay promoted or Graduated.
3. **Jash:**
   - Make sure 2027-2028 is reopened.
   - Delete it if it is not needed yet, and confirm 2026-2027 is still Active (5.f).
4. Send your filled-in copy of this file to the lead.
