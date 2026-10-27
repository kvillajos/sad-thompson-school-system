# Changes for UI

UI/UX overhaul on the `UI-Overhaul` branch (test branch, not deployed). No database (Supabase) changes. All `npm run check` checks pass after every phase.

## Phase 1: Colours, font and the app frame (`bee492a`)

- **Inter font**, stored in the project itself (the site's security settings block outside fonts).
- **Shared colour, corner and shadow settings** in one place, with matching dark-mode versions.
- **Restyled buttons, inputs, cards, badges, toasts and dialogs**, all on those shared settings.
- **Sidebar:** still navy with the sliding highlight. Links are grouped, a thin coloured strip at the top shows the role, it can collapse to icons (always collapsed on tablets), and it opens as a slide-in menu on phones.
- **New top bar on every page:** breadcrumb, current school year, notification bell (now for every role, using the existing notifications table), dark/light toggle and profile menu. Replaces the draggable floating profile.

## Phase 2: Tables (`4db50b9`)

- **Headers stay visible:** column headers and filter bars stick under the top bar while you scroll.
- **Phone cards:** on phones, tables turn into one card per row with labelled fields.
- **Loading and empty states:** "Loading…" rows show placeholder bars; empty tables show an icon above the message.
- **Cleaner rows:** a light header bar, drawn sort arrows, a hover tint instead of striped rows, and a quieter ⋯ menu.

## Phase 3: Side drawers (`6b23b35`)

- **Drawers instead of pop-ups:** create/edit forms and record details slide in from the right, with the title fixed at the top and the Save/Cancel row fixed at the bottom.
- **Pages covered:** accounts, faculty, sections, subjects, schedules, school years, announcements, approval reviews, Edit Profile, the student's edit request, and the registrar's review, placement, student details and history.
- **Still centered dialogs:** confirmations, password prompts and pickers.
- **Small fix:** picking an item from a ⋯ menu now closes the menu.

## Phase 4: Sign-in and password pages (`6e5d38e`)

- **One layout** for sign in, forgot password, verify code and set new password: a light form panel next to the campus photo, which carries a caption and the maintenance notices.
- **Visible heading and field labels** (hidden before), and the forgot-password link beside the Password label.
- **Phones:** the photo becomes a short band at the top with the seal overlapping its edge.

## Phase 5: Dashboards (`06a8260`)

- **Admin:** totals for pending approvals, enrolled students, sections and faculty; charts of students by grade and Senior High by strand; quick actions for Add account, Add section and Post announcement.
- **Faculty:** classes, students, classes today and next class; a chart of how many students got each letter grade; a 30-day attendance chart; quick links to attendance, grade upload and grade entry.
- **Student:** general average, attendance and classes today; a chart of each subject's grade against the passing mark of 75; quick links to schedule, grades and requesting a profile edit.
- **Read-only, from existing data.**

## Phase 6: Remaining pages (`22497da`)

- **Registrar page:** its 150 lines of built-in styles moved into the shared styles, so it now matches the admin pages.
- **Tabs:** sub-tabs became underline tabs; the schedule day tabs became pills.
- **Leftovers:** unstyled fields (such as School days), file pickers, bold dropdowns inside labels, and the oddly rounded dialog buttons were brought in line.
- **Bug fix:** in Manage Schedules, Escape in a section's schedule window pressed "Auto-schedule" instead of closing the window. It now closes it.

## Phase 7: Phone styles, dark mode and motion (`5f5b52b`)

- **Phone stylesheet:** cut from about 3,400 lines to 195. The shared phone cards replaced the hand-made per-table layouts, except the faculty grade sheet and the audit trail details.
- **Tablet stylesheet removed:** it only styled buttons that now live in the ⋯ menus.
- **Dark mode:** 60 hard-coded colours now follow the theme. Announcements show urgency with a tinted background instead of a thick coloured stripe on the left.
- **Motion:** buttons press down slightly when clicked; everything stops animating on devices set to reduce motion.

## Still open

- On short forms, the Save/Cancel row isn't pinned to the bottom of the drawer.
- Tables inside drawers don't keep their headers in view while scrolling, and don't become cards on phones.
