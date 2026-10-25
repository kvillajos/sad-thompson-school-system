# Auto-Assign Testing

## Test 1: More Students Than Available Seats

**Steps**
1. Prepare a grade level with more eligible students than available seats.
2. Open the registrar's Sectioning tab.
3. Run auto-assign for that grade level.

**Expected**
- Assignments do not exceed section capacity.
- Students who cannot be placed are reported as unplaced.

**Actual:** Pending manual testing.

## Test 2: Only One Section

**Steps**
1. Prepare a grade level with one section and available seats.
2. Add eligible students without existing section assignments.
3. Run auto-assign.

**Expected**
- Eligible students are assigned to the available section up to its capacity.
- No student is assigned more than once.

**Actual:** Pending manual testing.

## Test 3: Excluded Students

**Steps**
1. Select eligible students to exclude from auto-assignment.
2. Run auto-assign for their grade level.

**Expected**
- Excluded students receive no new assignments.
- Other eligible students can still be assigned.

**Actual:** Pending manual testing.

## Test 4: Grade With No Sections

**Steps**
1. Prepare eligible students in a supported grade level without any sections.
2. Run auto-assign for that grade level.

**Expected**
- No assignments are created for those students.
- Students are reported as unplaced because no section exists.

**Actual:** Pending manual testing.

## Test 5: Run Auto-Assign Twice

**Steps**
1. Run auto-assign for a grade level.
2. Apply or save the assignments.
3. Run auto-assign again for the same grade level.

**Expected**
- Students already assigned are not assigned again.
- Remaining eligible students are assigned only if seats are available.
- Section capacity is respected.

**Actual:** Pending manual testing.

## Notes

Automated sectioning checks pass. Actual results for these five scenarios must be recorded after testing through the registrar interface.
