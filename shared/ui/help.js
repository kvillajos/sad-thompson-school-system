// "How do I…" (profile menu): short task guides for the signed-in role, written for whoever runs the system
// next. Loaded only when opened. Keep the steps in sync with page, tab and button names when they change.
import { escapeHtml } from '../lib/html.js'

const HELP = {
  Administrator: [
    [
      'Start a new school year',
      [
        'Open <b>Year Setup</b> and press <b>+ Create</b> for the next year (or pick it if it exists).',
        'Work down the steps: copy sections and timetables from last year, carry over lunch times and the grading scale, set the calendar and school days, assign advisers.',
        'When every step is green, press <b>Open enrollment</b>.'
      ]
    ],
    [
      'Set quarter dates, grade deadlines and holidays',
      [
        'Open <b>School Calendar</b> and choose the year.',
        "Enter each quarter's start, end and grade deadline, then <b>Save quarters</b>.",
        'Add holidays one by one.',
        'Press <b>Compute from calendar</b> to fill the school days per month (you can still adjust them on <b>Manage Subjects</b>).'
      ]
    ],
    [
      'Open or close enrollment',
      [
        '<b>Year Setup</b> → step 5 → <b>Open enrollment</b> / <b>Close enrollment</b>.',
        'While it is closed nobody can enroll, re-enroll, import or place students into that year. Moving students who are already placed still works.'
      ]
    ],
    [
      'See which teachers have not submitted grades',
      [
        'Open <b>Grade Tracker</b>, choose the year and quarter.',
        '"Late" means the quarter\'s grade deadline has passed and the class is not complete. Set deadlines on <b>School Calendar</b>.'
      ]
    ],
    [
      'Approve an application that is missing documents',
      [
        'Approval is blocked while a required document is missing.',
        'The registrar sends a <b>Requirements override</b> request; approve it in <b>Dashboard → Pending Approvals</b>, then approve the application.'
      ]
    ],
    [
      'Change the list of required documents',
      [
        'Open <b>Admissions</b> → <b>Required documents</b>.',
        'Use <b>Edit</b> to change grades, "Transferees only", Required/Optional, or turn an item off. <b>+ Add item</b> adds a new one.'
      ]
    ],
    [
      'Activate logins for imported or newly approved students',
      [
        'Open <b>Manage Accounts</b> and press <b>Provision pending logins</b>.',
        'Each student signs in with their username and the password <i>username</i>123, and should change it.'
      ]
    ],
    [
      'Assign or change a section adviser',
      [
        '<b>Manage Sections</b> → edit the section → choose the moderator (adviser).',
        'The adviser then sees the whole section on <b>My Advisory</b>.'
      ]
    ],
    [
      'Close a school year',
      [
        '<b>Year Setup</b> → <b>End of the year</b>. Finish every item (grades submitted, promotion done, requests handled).',
        'Press <b>Close</b>. If something must stay open, use <b>Close anyway…</b> and give a reason.',
        'A closed year is read-only for faculty and the registrar. <b>Reopen year</b> undoes it.'
      ]
    ],
    [
      'Record or review a discipline case',
      [
        "Open <b>Discipline</b>, type the student's name, press <b>+ Add record</b>.",
        'Use <b>Edit</b> to resolve or dismiss it. Students see their own records.'
      ]
    ],
    [
      'Undo a change or bring back a deleted record',
      ['<b>Audit Trail</b> → <b>Restore Changes</b>. Changes from the last 30 days can be restored.']
    ],
    ['Change the grading scale', ['<b>Manage Subjects</b> → <b>Grading scale</b> → choose the year, edit the bands, <b>Save scale</b>.']]
  ],
  Registrar: [
    [
      'Admit a new student',
      [
        '<b>New Admission</b>: fill in the form and upload the documents you have, then <b>Submit Application</b>.',
        'Paper documents: open the application in <b>Applications</b> and tick them under <b>Requirements</b>.',
        'The admin approves it; the student record, enrollment and login are created then.'
      ]
    ],
    [
      'Admit a student who is still missing a document',
      [
        'Open the application in <b>Applications</b> → <b>Requirements</b> → <b>Request override</b> and give the reason (e.g. "PSA to follow by July 15").',
        'Once the admin approves the override, the application can be approved.'
      ]
    ],
    [
      'Add many students at once',
      [
        '<b>Bulk Import</b> → <b>Download template</b>, fill it in (CSV or Excel), choose the file.',
        'Fix any row marked "Fix" in the file and choose it again, then <b>Import</b>.',
        'Then place them with <b>Section Students → Auto-Assign Students</b> and ask the admin to provision their logins.',
        'Enrollment for the year must be open.'
      ]
    ],
    ['Re-enroll a returning student', ['<b>Active Directory</b> → <b>Not re-enrolled</b> → <b>Enroll for</b> the new year.']],
    [
      'Place students in sections',
      [
        '<b>Section Students</b> → <b>Auto-Assign Students</b> for a balanced placement, or place one student at a time. A full section needs a capacity override (admin).'
      ]
    ],
    [
      'Print report cards for a whole section',
      ['<b>Section Reports</b> → choose the year and section → <b>Print report cards</b>. Print, or download one PDF.']
    ],
    [
      'Export SF1, SF2, SF5 or SF10',
      ['<b>Section Reports</b> → choose the section → the SF button. SF2 also needs the month. Files open in Excel.']
    ],
    [
      'Promote students and graduate Grade 12',
      [
        '<b>Promotion &amp; Transfers</b> → request the batch promotion; the admin approves it.',
        'Passing Grade 12 students become Graduated (their login then shows only the transcript and document requests). See the lists under <b>Graduation</b>.'
      ]
    ],
    [
      'Handle a document request',
      [
        '<b>Document Requests</b>: <b>Approve</b> (or <b>Reject</b> with a reason) → prepare it → <b>Ready for pickup</b> → <b>Released</b> when collected. The student is notified at each step.'
      ]
    ],
    ['Record a discipline case', ["<b>Discipline</b> → type the student's name → <b>+ Add record</b>."]],
    ['Undo a change', ['<b>Restore Changes</b> lists what you changed in the last 30 days.']]
  ],
  Faculty: [
    [
      'Enter and submit grades',
      [
        '<b>Grades</b> → choose the class → type the scores → <b>Save Grades</b>.',
        'When the class is final, <b>Submit &amp; Lock</b>. Locked grades change only through <b>Request correction</b> (the admin approves).'
      ]
    ],
    [
      'Upload grades from a file',
      ['<b>Bulk Upload</b> → download the template, fill it in, upload. Every row is checked before anything is saved.']
    ],
    [
      'Take attendance',
      [
        '<b>Attendance</b> → choose the class and date → mark only who is absent, late or excused → <b>Save Attendance</b>. Unsaved marks are kept as a draft.'
      ]
    ],
    [
      'See my advisory section',
      [
        "<b>My Advisory</b> shows every subject's grades, attendance, your students' requests and discipline records for the section you advise."
      ]
    ],
    ['Record a discipline case for my advisory student', ['<b>My Advisory</b> → <b>Discipline</b> → type the name → <b>+ Add record</b>.']]
  ],
  Student: [
    [
      'See my grades, schedule or attendance',
      ['Use <b>Grades</b>, <b>Schedule</b> and <b>Profile → Attendance Record</b>. <b>History</b> has past school years.']
    ],
    [
      'Get my transcript',
      ['<b>Transcript</b> → print or download the unofficial copy. For an official Form 137, request it under <b>Requests</b>.']
    ],
    [
      'Request Form 137, a Good Moral certificate or a Certificate of Enrollment',
      ["<b>Requests</b> → <b>Request a Document</b>. You are notified when it is ready for pickup at the Registrar's Office."]
    ],
    ['Fix my name, address or guardian details', ['<b>Profile</b> → <b>Request edit</b>. The admin reviews the change.']],
    ['Change my password', ['Open the menu with your name (top right) → <b>Change Password</b>.']]
  ]
}

export function openHelp(roleLabel) {
  const items = HELP[roleLabel] || []
  document.getElementById('help-modal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'help-modal'
  modal.className = 'admin-modal stack-above'
  modal.innerHTML = `<div class="admin-modal-box dialog-box" role="dialog" aria-modal="true" aria-labelledby="help-title" style="width:min(100%,720px)">
    <div class="admin-modal-head"><h3 id="help-title">How do I…</h3><button type="button" data-help-close aria-label="Close">×</button></div>
    <input type="search" data-help-search maxlength="80" placeholder="Search, e.g. enrollment, report card" aria-label="Search help" style="width:100%;margin:0 0 12px">
    <div data-help-list>${items
      .map(
        ([title, steps]) =>
          `<details data-help-item style="border:1px solid var(--ui-border);border-radius:10px;padding:10px 14px;margin:0 0 8px"><summary style="cursor:pointer;font-weight:700">${escapeHtml(title)}</summary><ol style="margin:8px 0 0;padding-left:20px;line-height:1.55">${steps
            .map(step => `<li>${step}</li>`)
            .join('')}</ol></details>`
      )
      .join('')}</div>
    <p class="admin-note" data-help-empty hidden>No matching guide.</p>
  </div>`
  document.body.appendChild(modal)
  const close = () => modal.remove()
  modal.querySelector('[data-help-close]').onclick = close
  modal.addEventListener('click', event => event.target === modal && close())
  const search = modal.querySelector('[data-help-search]')
  search.oninput = () => {
    const query = search.value.trim().toLowerCase()
    let shown = 0
    modal.querySelectorAll('[data-help-item]').forEach(item => {
      const match = !query || item.textContent.toLowerCase().includes(query)
      item.hidden = !match
      if (match) shown++
      item.open = Boolean(query) && match
    })
    modal.querySelector('[data-help-empty]').hidden = shown > 0
  }
  search.focus()
}
