# System Test Cases: Major Processes

These cases walk through the main things the system does, from a student applying to a school year closing. Five people share them: two on admin, one each on registrar, faculty and student. Work through your cases in order, tick **Pass** or **Fail**, and write what you saw under **Notes** whenever something is off.

| Person | Role | Covers |
| --- | --- | --- |
| **Sam** | Admin 1 | People, classes and approvals: accounts, faculty, sections, subjects, schedules, admissions, the Dashboard |
| **Jash** | Admin 2 | The school year: School Years (setup, calendar, enrollment, closing), Grade Tracker, Discipline, Reports & Audit |
| **John** | Registrar | Students' records: admissions, placement, directory, promotion, graduation, documents |
| **Khyle** | Faculty | Teaching: classes, grades, attendance, advisory |
| **Angela** | Student | What a student sees and asks for |

---

## Before you start

1. **Where:** the live site, on the latest deploy of `main`.
2. **Test data is real.** Everyone shares the live database.
   - Give everything you create a name starting with **TEST** (e.g. "TEST Juan Dela Cruz", section "TEST Rizal").
   - Only close or reopen **2027-2028**, which Jash creates in J1. **Never close 2026-2027.**
   - Promotion runs on a whole grade level. In R7, **exclude everyone except your TEST students**.
3. **Hand-offs.** Some steps need another person. They are marked **→ Name**. Message that person when you reach the step.
4. **Order:**
   - **Jash** starts with J1-J3 (the new year has to exist first).
   - **Sam** does S1-S4 early (the TEST teacher, section and schedule are used by others).
   - **John** does R1 early (the TEST applicant is used by Sam and Angela).
   - Promotion (R7) and closing a year (J6) come **last**.
5. **Fail?** Write down the page, what you clicked, and the error message, and take a screenshot. Send it to the lead.

Each case uses this shape:

> **You are** the role you sign in as, and what you are trying to do.
> **Steps** to follow. **Expected** is what should happen.
> `[ ] Pass  [ ] Fail` · **Notes:**

### The two big flows, end to end

Most cases are one step of one of these. If a hand-off stalls, check where you are here.

**A student's journey**
1. **John** files a TEST admission application (R1).
2. **Sam** reviews and approves it; the student login is created (S5).
3. **John** places the student in a section (R3).
4. **Khyle** sees the student in class, records grades and attendance (K2-K4).
5. **Angela** signs in as that student and sees the schedule and grades (A1-A2).
6. **John** promotes or graduates the student at year end (R7).

**A school year's life**
1. **Jash** adds the year, copies last year's setup, and fills in the calendar (J1-J2).
2. **Jash** assigns advisers and opens enrollment (J3).
3. Teaching happens; **Jash** watches grade submission on Grade Tracker (J4).
4. **Jash** works through the year-end checklist and closes the year (J6).

---

## 1. Sam: Admin 1 (people, classes, approvals)

### S1 Accounts
**You are** the admin adding a new teacher and handling an account.

**Steps**
1. Open **Manage** → **Accounts** → **Add Account**. Create a TEST faculty account.
2. Press **Provision pending logins**, or **Provision Login** on the new account.
3. Sign in as the new teacher in a private window, then sign out.
4. Back as admin: **Reset Password** on the TEST account.
5. Deactivate the TEST account, then activate it again.

**Expected**
- The account is listed with its role, and the login works after step 2.
- After step 4, the old password stops working and the new one works.
- A deactivated account cannot sign in; after activating it can.

`[ ] Pass  [ ] Fail` · **Notes:**

### S2 Faculty and subject assignment (two teachers, one subject)
**You are** the admin making two teachers able to teach the same subject.

**Steps**
1. **Manage** → **Faculty**. On your TEST teacher, press **Assign**, tick a subject (for example Pre-Calculus), **Save Assignments**.
2. Assign the same subject to a second, real Senior High teacher.
3. Press **View / Edit** on each one.

**Expected**
- Both teachers list the subject under **Assigned Subjects**.
- Assigning the same subject twice to the same teacher is not possible.

`[ ] Pass  [ ] Fail` · **Notes:**

### S3 Sections and subjects
**You are** the admin preparing classes and the grading scale.

**Steps**
1. **Manage** → **Sections** → **+ Add Section**: two TEST sections in the same grade (e.g. TEST A and TEST B), current school year. Use **Choose Faculty** to set an adviser.
2. **Manage** → **Subjects**: open the **Grading scale** card, check the bands, press **Save scale**.
3. **+ Add Subject**: a TEST subject for that grade, **Save Subject**.

**Expected**
- Both sections show under the current year with their adviser.
- The scale saves for the chosen year.
- The TEST subject appears in the list and in the Schedules subject picker.

`[ ] Pass  [ ] Fail` · **Notes:**

### S4 Schedules, manual and automatic
**You are** the admin building the timetable.

**Steps**
1. **Manage** → **Schedules** → open **TEST A** → **+ Add Subject** → **Choose subject** (the S2 subject) → **Choose faculty** (your TEST teacher) → pick days and a time → **Save schedule**.
2. Open **TEST B** and add the same subject with the **other** teacher from S2.
3. On TEST B, try adding a class for the TEST teacher at the same time as TEST A's class.
4. Press **Auto-schedule** on TEST B for its remaining subjects, review the plan, then cancel or apply.
5. **→ Khyle:** sign in as each of the two teachers (or ask them) and open **Class List**.

**Expected**
- TEST A shows the subject with the TEST teacher; TEST B shows it with the other teacher.
- Step 3 is refused with a schedule conflict message (the same teacher can't be in two classes at once).
- Auto-schedule only uses teachers assigned to each subject, and does not double-book anyone.
- Each teacher sees **only their own** section of that subject.

`[ ] Pass  [ ] Fail` · **Notes:**

### S5 Review an admission (approve one, decline one)
**You are** the admin deciding on new applications.

**Steps**
1. **→ John:** file two TEST applications (R1).
2. Open the **Dashboard**. Under **Pending Approvals**, find the single **Admission** row and press **Open Admissions**.
3. On **Admissions**, press **Review** on the first. Press **View Documents & Details**.
4. Try **Approve** before ticking the three **Before you decide** checks.
5. Tick all three, **Approve**.
6. **Review** the second. Tick the checks, leave **Remarks** empty and press **Decline**. Then enter a reason and **Decline**.

**Expected**
- The Dashboard shows one Admission row with the number waiting, not one row per application.
- Approve and Decline stay greyed out for 3 seconds and until all three checks are ticked.
- The approved applicant gets a student account and login (a message names the username).
- Declining without a reason is refused; with a reason it goes through and John sees it as Rejected.
- If John has the application open for correction, the review shows a lock and the buttons stay disabled.

`[ ] Pass  [ ] Fail` · **Notes:**

### S6 Dashboard approvals
**You are** the admin clearing requests from the registrar, faculty and students.

**Steps**
1. Wait for these to arrive, then handle each under **Pending Approvals**:
   - **→ Khyle:** a grade correction (K3) — **Approve**.
   - **→ Angela:** a profile edit (A5) — **Approve**.
   - **→ Angela:** a portal request (A4) — approve one, **Reject** the other.
   - **→ John:** a requirements override (R2) — **Approve**.
   - **→ John:** the batch promotion (R7) — **Approve**.
2. Use the type filter box to show only one type.

**Expected**
- Each request shows who asked, when, and the reason.
- Approving applies the change (corrected score, new address, override, promotion); rejecting leaves things as they were.
- The requester sees the result.
- The filter narrows the list and shows a count per type.

`[ ] Pass  [ ] Fail` · **Notes:**

### S7 Announcements and feedback
**You are** the admin talking to everyone.

**Steps**
1. **Dashboard** → **Announcements** → **+ Add**: a TEST announcement for faculty only. **Post**.
2. Pin it, then edit it.
3. Under **Feedback**, open one item from faculty or the registrar and mark it fixed.

**Expected**
- **→ Khyle:** sees the announcement; **→ Angela:** does not.
- The pinned announcement stays on top.
- The fixed item moves to **Fixed** with its count.

`[ ] Pass  [ ] Fail` · **Notes:**

### S8 Navigation (regression)
**You are** the admin checking every page opens.

**Steps**
1. Open every sidebar link: **Dashboard**; **Manage** (click to open) → Accounts, Faculty, Sections, Subjects, Schedules; **Grade Tracker**, **School Years** (both tabs), **Admissions**, **Discipline**, **Reports & Audit** (both tabs).
2. Close **Manage**, reload, then open one of its pages.
3. Open the browser console (F12) on each page.

**Expected**
- Every page opens with no red errors in the console.
- **Manage** opens by itself on its own pages and otherwise remembers whether you left it open.
- Hovering a sidebar item never spills into the white page area.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 2. Jash: Admin 2 (the school year)

### J1 Add next year and copy the setup
**You are** the admin preparing 2027-2028.

**Steps**
1. **School Years** → **+ Add school year**. It is prefilled with 2027-2028 and dates. Press **Add school year**.
2. Click the **2027-2028** card. On **Setup & closing**, step 2: **Copy sections and schedules from 2026-2027**. Read the preview, expand two sections, then **Copy setup**.
3. Press **Carry over lunch times and grading scale**.
4. Run the copy again.
5. Step 1 → **Edit name or dates**: change the end date, save, then put it back.

**Expected**
- The new card says **Upcoming** (blue); 2026-2027 says **Current** (green).
- The preview lists each section with its classes by subject name, teacher, days and time. Students are not copied.
- Step 2 turns green after steps 2-3.
- Step 4 says everything already exists; no duplicates are made.
- Dates that overlap another year are refused.

`[ ] Pass  [ ] Fail` · **Notes:**

### J2 Calendar
**You are** the admin entering 2027-2028's calendar.

**Steps**
1. On the **2027-2028** card, open the **Calendar** tab (or step 3 → **Open the Calendar tab**).
2. Enter all four quarters' start, end and grade deadline → **Save quarters**.
3. Add two TEST holidays; remove one.
4. **Compute from calendar** → **Save school days**.
5. Go back to **Setup & closing**.
6. Reload the page.

**Expected**
- Quarters outside the year's dates, or overlapping each other, are refused with a reason.
- The school-day counts skip weekends and the holiday.
- Step 3 is green after step 5.
- After the reload you are still on the same year and tab.

`[ ] Pass  [ ] Fail` · **Notes:**

### J3 Advisers and enrollment
**You are** the admin opening 2027-2028 for enrollment.

**Steps**
1. Step 4 lists sections with no adviser. Use **Open Manage Sections** and set an adviser on one TEST section.
2. Step 5: leave enrollment **closed**. **→ John:** try to enroll or import a TEST student into 2027-2028 (R5).
3. **Open enrollment**. **→ John:** try again.
4. **Close enrollment** again when John is done.

**Expected**
- The step 4 list shrinks as advisers are set.
- While closed, John is refused; after opening, it works.
- The card shows "Enrollment open" while it is open.

`[ ] Pass  [ ] Fail` · **Notes:**

### J4 Grade Tracker
**You are** the admin checking which classes have not submitted grades.

**Steps**
1. **→ Khyle:** submit and lock one class's grades (K3).
2. **Grade Tracker** → the current year and quarter. Switch between **By faculty** and **By class**.
3. Find a class with no grades whose deadline has passed.

**Expected**
- Khyle's class shows complete.
- A class with no grades after the deadline shows **Late**; before the deadline it does not.
- If a deadline is missing, the link sends you to **School Years → Calendar**.

`[ ] Pass  [ ] Fail` · **Notes:**

### J5 Discipline
**You are** the admin recording an incident.

**Steps**
1. **Discipline** → type a TEST student's name → **+ Add record** → fill in the type, date and details → save.
2. Mark it **Resolved**.
3. **→ Angela:** check it shows on the student side (A6).

**Expected**
- The record saves and shows for the admin, the registrar and the student's adviser.
- The student sees it read-only.

`[ ] Pass  [ ] Fail` · **Notes:**

### J6 Year-end checklist and closing (do this last)
**You are** the admin closing 2027-2028.

**Steps**
1. **School Years** → **2027-2028** → **End of 2027-2028**.
2. Read each unfinished item. Try **Close year** while some are unfinished.
3. Close it with an override reason.
4. As **→ Khyle** and **→ John**, try to change anything in 2027-2028.
5. Reopen it.

**Expected**
- Unfinished items are listed (grades, promotion, requests).
- Closing without a reason is refused; with one it closes.
- The card turns **Closed** (grey, "Read-only"). Faculty and the registrar can view but not change that year.
- After reopening, editing works again.
- 2026-2027 is never touched.

`[ ] Pass  [ ] Fail` · **Notes:**

### J7 Reports & Audit
**You are** the admin printing reports and checking what changed.

**Steps**
1. **Reports & Audit** → **Reports** tab: generate a **Master Class List** for a TEST section, a **Section Summary**, and **School Statistics**. **Print Report** once.
2. **Audit Trail** tab: find today's TEST changes in **Recent Audit Events**; filter by action.
3. **Audit Archive**: pick today's date → **Export PDF**.
4. **Restore Changes**: undo one TEST edit (e.g. the S3 section name).

**Expected**
- Each report shows only the chosen filters; the printout shows only the report.
- The audit lists who did what and when.
- The PDF lists that day's actions.
- The restored item goes back to how it was, and the undo itself is logged.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 3. John: Registrar (students' records)

### R1 New admission application
**You are** the registrar filing an application for a new student.

**Steps**
1. **Admissions** → **New Admission**. Fill in a TEST applicant. Press **Save Draft**, leave, then **Resume Draft**.
2. Submit it. Make a second TEST application for Sam's S5.
3. Open **Applications** and find both.

**Expected**
- The draft comes back with what you typed.
- Missing required fields are pointed out before submitting.
- Both show as waiting. **→ Sam:** they appear under Admissions (S5).

`[ ] Pass  [ ] Fail` · **Notes:**

### R2 Requirements checklist and override
**You are** the registrar tracking paper documents.

**Steps**
1. **Applications** → open a TEST application → **Requirements**.
2. Tick the documents received; leave the PSA unticked. Upload one file.
3. **Request override** with no reason, then with "PSA to follow by July 15".
4. **→ Sam:** approve it (S6).

**Expected**
- The ticks save and the Requirements column updates.
- The override needs a reason; after Sam approves, the application counts as complete.

`[ ] Pass  [ ] Fail` · **Notes:**

### R3 Section placement
**You are** the registrar placing approved students in sections.

**Steps**
1. **Students** → **Section Students**. Use **Placement Tool** to place Sam's approved S5 student in **TEST A**.
2. Try **Auto-Assign Students** for one grade, look at the plan, then cancel.
3. Fill a section to capacity, then try one more → request a **Capacity Override**.

**Expected**
- The student shows in TEST A. **→ Khyle:** the student appears on the TEST teacher's Class List.
- Auto-assign respects capacity and grade.
- Going over capacity needs an approved override.

`[ ] Pass  [ ] Fail` · **Notes:**

### R4 Directory and Quick View
**You are** the registrar looking up students.

**Steps**
1. **Students** → **Directory**. Switch between **Current SY**, **Not re-enrolled** and **All Students**. Search for a TEST student. **Export CSV**.
2. Click a student to open the Quick View.
3. **Students** → **Academic History**: open one student's history.

**Expected**
- Each view shows the right students; the CSV matches what's on screen.
- Quick View shows enrollment, section, GPA and history, and closes with × or Escape.
- Academic History lists grades by year.

`[ ] Pass  [ ] Fail` · **Notes:**

### R5 Bulk import and the enrollment window
**You are** the registrar adding students from a spreadsheet.

**Steps**
1. **Admissions** → **Bulk Import** → download the template. Add 3 TEST students, plus a 4th row with no LRN.
2. Choose the file; fix the bad row; choose it again → **Import**.
3. **→ Sam:** **Provision pending logins**. Sign in as one imported student.
4. With **→ Jash** keeping 2027-2028 closed (J3), import one TEST row for 2027-2028. Again after he opens it.

**Expected**
- The bad row is marked and Import is blocked until it is fixed.
- Three students are created; the login works.
- The 2027-2028 import is refused while closed and works once open.

`[ ] Pass  [ ] Fail` · **Notes:**

### R6 Transfer and shifting
**You are** the registrar moving a student.

**Steps**
1. **Year-End** → **Promotion & Transfers** → **Transfer & Shifting**: move a TEST student from TEST A to TEST B → **Send for Approval**.
2. Request a student exit for another TEST student.
3. **→ Sam:** approve both (S6).

**Expected**
- Nothing changes until Sam approves.
- After approval, the student is in TEST B, and the exited student is no longer active.

`[ ] Pass  [ ] Fail` · **Notes:**

### R7 Batch promotion and graduation (do this last)
**You are** the registrar promoting at year end.

**Steps**
1. **Year-End** → **Promotion & Transfers** → **Batch Promotion** → Grade 12. **Exclude everyone except** one passing and one failing TEST student.
2. Press **View subject breakdown** on the failing student.
3. Request the promotion. **→ Sam:** approve it (S6).
4. **Year-End** → **Graduation**.

**Expected**
- The breakdown shows each subject's grade and marks the failing one.
- The passing student is Graduated and listed under Graduation; the failing one is Retained.
- Excluded students are unchanged.

`[ ] Pass  [ ] Fail` · **Notes:**

### R8 Section reports and DepEd forms
**You are** the registrar printing what the school and DepEd need.

**Steps**
1. **Year-End** → **Section Reports** → a section → **Print report cards**, then download the PDF.
2. Download **SF1**, **SF2** (pick a month), **SF5** and **SF10** (one student). Open each in Excel.

**Expected**
- One report card per student per page, with grades, attendance and adviser.
- Each .xlsx opens without a repair warning and has the right content.

`[ ] Pass  [ ] Fail` · **Notes:**

### R9 Document requests
**You are** the registrar handling Angela's requests from A4.

**Steps**
1. **Requests** → **Document Requests**.
2. **Approve** the Form 137 → **Ready for pickup** → **Released**.
3. **Reject** another request, first with no reason, then with a reason.

**Expected**
- Each status change saves, and **→ Angela** sees it and gets a notification.
- A rejection without a reason is refused.

`[ ] Pass  [ ] Fail` · **Notes:**

### R10 Navigation (regression)
**You are** the registrar checking the sidebar.

**Steps**
1. Open each group (**Admissions**, **Students**, **Year-End**, **Requests**) and every tab inside.
2. Reload while on a tab inside a closed group. Use the browser Back button between two tabs.

**Expected**
- Every tab opens with no console errors (F12).
- The group holding the current tab is always open, so the highlighted tab is never hidden.
- Every item has its own icon.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 4. Khyle: Faculty (teaching)

### K1 Dashboard and class list
**You are** a teacher starting the day.

**Steps**
1. Open the **Dashboard**. Look at **My Schedule** and **My Classes**.
2. Press **View list** on one class.
3. On **Class List**, filter by gender and export.

**Expected**
- My Classes shows each class with its student, male and female counts.
- **View list** opens Class List on that class.
- Only your own classes and students appear (see S4).

`[ ] Pass  [ ] Fail` · **Notes:**

### K2 Attendance with a draft
**You are** a teacher whose browser closes mid-attendance.

**Steps**
1. **Attendance** → a class and today's date. Mark two Absent and one Late. **Do not save.**
2. Reload, pick the same class and date → **Restore draft**.
3. **Save Attendance**.
4. Repeat step 1, reload, then **Discard draft**.

**Expected**
- The marks come back after step 2, and save in step 3.
- Nothing is saved until **Save Attendance**.

`[ ] Pass  [ ] Fail` · **Notes:**

### K3 Grades: enter, lock, correct
**You are** a teacher finishing a quarter.

**Steps**
1. **Grades** → a class → type the scores → **Save Grades**.
2. Change a score, then try to switch class without saving.
3. **Submit & Lock**. Try to change a locked score.
4. **Request correction** on one score with a reason. **→ Sam:** approve it (S6).

**Expected**
- Scores stay between 0 and 100.
- Step 2 warns about unsaved changes.
- Locked scores can't be edited; after Sam approves, the corrected score shows.

`[ ] Pass  [ ] Fail` · **Notes:**

### K4 Upload a spreadsheet
**You are** a teacher uploading grades from Excel.

**Steps**
1. **Grades** → a class → **Upload spreadsheet** → **Download template**.
2. Fill it in, with one bad row (a score of 120). Save as CSV and choose it.
3. Fix the bad cell in the grid → **Save Upload**.

**Expected**
- The window's title names the class and year you picked on Grades.
- The bad row is red and saving is blocked until it is fixed.
- After saving, the window closes and the Grades table shows the uploaded scores.

`[ ] Pass  [ ] Fail` · **Notes:**

### K5 My Advisory
**You are** an adviser checking your whole section.

**Steps**
1. **→ Sam:** set you as adviser of a TEST section (S3).
2. **My Advisory**: look at **Grades, every subject**, **Attendance this school year**, **Requests from my students**, and **Discipline**.
3. Add a discipline record for one of your students. Try one from another section.

**Expected**
- Every subject's grades show for the section, not only yours.
- The record saves; another section's student is not allowed.

`[ ] Pass  [ ] Fail` · **Notes:**

### K6 Reports and feedback
**You are** a teacher printing a class report and reporting a problem.

**Steps**
1. **Reports**: generate and print a report for one class.
2. **Feedback**: send a TEST message. Check **My Requests**.

**Expected**
- The report shows only your class.
- **→ Sam:** sees the feedback (S7); you see its status change.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## 5. Angela: Student

Use the TEST student Sam approved in S5 (or one from John's R5). Tell Jash its name for J5.

### A1 First sign-in, dashboard and schedule
**You are** a new student signing in.

**Steps**
1. Sign in with the new login. Change the password if asked.
2. Look at the **Dashboard** and **Schedule**.

**Expected**
- The dashboard shows the current term and section placement.
- The schedule matches what Sam set for the section (S4), with the right teachers.

`[ ] Pass  [ ] Fail` · **Notes:**

### A2 Grades and history
**You are** a student checking grades.

**Steps**
1. **Grades**: look at this year's grades after **→ Khyle** saves them (K3).
2. **History**: open the school year picker and choose each year.

**Expected**
- Grades show by quarter, with the final grade.
- The picker lists the current year first, then every year you have records for.
- A year with no records shows a clear message.

`[ ] Pass  [ ] Fail` · **Notes:**

### A3 Transcript
**You are** a student who needs a copy of their grades.

**Steps**
1. **Transcript** → **View PDF**.

**Expected**
- A PDF with your name, LRN and every year's grades, marked unofficial.

`[ ] Pass  [ ] Fail` · **Notes:**

### A4 Requests and documents
**You are** a student asking the school for things.

**Steps**
1. **Requests** → **Submit a Request**: an **LRN update** and a **Section transfer**. **→ Sam:** approves one, rejects the other (S6).
2. **Request a Document**: a Form 137 (2 copies, with a purpose) and a Good Moral certificate. **→ John:** processes them (R9).
3. Watch **My Requests**, the documents table and your notifications.

**Expected**
- The **Copies** and **Purpose** boxes look like the **Document** box (label above, full width, rounded).
- Each request shows Pending first, then the decision.
- Documents move Pending → Approved → Ready for pickup → Released (or Rejected with a reason), with a notification at each step.

`[ ] Pass  [ ] Fail` · **Notes:**

### A5 Profile edit
**You are** a student whose address changed.

**Steps**
1. **Profile** → **Request edit** → change the address → **Submit request**.
2. **→ Sam:** approve it (S6).

**Expected**
- The new address shows after approval, not before.

`[ ] Pass  [ ] Fail` · **Notes:**

### A6 Discipline record
**You are** a student checking your record.

**Steps**
1. After **→ Jash's** J5, open the Dashboard → **Discipline Record**.

**Expected**
- The record shows its type, date and status.
- There are no edit or delete buttons.

`[ ] Pass  [ ] Fail` · **Notes:**

### A7 Graduate login
**You are** a student who graduated in **John's** R7.

**Steps**
1. Sign in as the graduated TEST student.
2. Look through the menu. Request a Form 137.

**Expected**
- Only the transcript and document requests are available; current-year panels are hidden.
- The Form 137 request goes through.

`[ ] Pass  [ ] Fail` · **Notes:**

---

## Cleanup (everyone, after all tests)

1. **Sam:** remove TEST accounts, sections, subjects and schedules (S1-S4).
2. **John:** remove TEST applications, students and document requests.
3. **Jash:** confirm 2027-2028 is closed or deleted as the lead decides, and that **2026-2027 is untouched**.
4. Everyone: send your Pass/Fail sheet and screenshots to the lead.
