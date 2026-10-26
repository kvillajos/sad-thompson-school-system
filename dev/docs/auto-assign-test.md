
# Auto-Assign Testing

## Test 1: More Students Than Available Seats

**Steps**
1. Create five eligible students in Grade 7.
2. Configure one section with a capacity of three students.
3. Run `planBalancedAssignments()` using these students and the section.

**Expected**
- Assignments do not exceed section capacity.
- Students who cannot be placed are reported as unplaced.

**Actual:** Passed automated testing. Three students were assigned, and two were reported as unplaced.

## Test 2: Only One Section

**Steps**
1. Create three eligible students in Grade 7.
2. Configure one section with a capacity of three students.
3. Run `planBalancedAssignments()`.

**Expected**
- Eligible students are assigned to the available section up to its capacity.
- No student is assigned more than once.

**Actual:** Passed automated testing. All three students were assigned, with no duplicate student assignments.

## Test 3: Excluded Students

**Steps**
1. Create four eligible students in Grade 7.
2. Configure one section with a capacity of four students.
3. Exclude students with IDs 7000 and 7002.
4. Run `planBalancedAssignments()`.

**Expected**
- Excluded students receive no new assignments.
- Other eligible students can still be assigned.

**Actual:** Passed automated testing. Two students were assigned, and neither excluded student received an assignment.

## Test 4: Grade With No Sections

**Steps**
1. Create three eligible students in Grade 7.
2. Provide no matching sections.
3. Run `planBalancedAssignments()`.

**Expected**
- No assignments are created for those students.
- Students are reported as unplaced because no matching section exists.

**Actual:** Passed automated testing. No assignments were created, and all three students were reported as unplaced.

## Test 5: Run Auto-Assign Twice

**Steps**
1. Create four eligible students in Grade 7.
2. Configure one section with a capacity of four students.
3. Run `planBalancedAssignments()` and record the first assignments.
4. Pass those assignments as existing enrollments to a second run.

**Expected**
- Students already assigned are not assigned again.
- Remaining eligible students are assigned only if seats are available.
- Section capacity is respected.

**Actual:** Passed automated testing. The first run assigned all four students; the second run created zero additional assignments.

## Notes

All five scenarios passed automated testing using `dev/scripts/checks/check-sectioning-edge.mjs`.

The automated tests verify the assignment-planning logic. They do not establish that all five scenarios have been manually verified through the registrar interface or that database writes were tested for each scenario.

Manual UI verification remains pending.
