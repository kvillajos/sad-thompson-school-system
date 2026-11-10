import { escapeHtml } from '../lib/html.js'

/**
 * Builds standard DepEd Form 137 (Learner's Permanent Academic Record) printable layout.
 */
export function generateForm137Template({ student, scholasticHistory, schoolInfo }) {
    const schoolName = schoolInfo?.name || 'THOMPSON CHRISTIAN SCHOOL, INC.'
    const schoolId = schoolInfo?.id || '405678'
    const region = schoolInfo?.region || 'REGION XI - DIVISION OF DAVAO CITY'

    const rowsHtml = (scholasticHistory || []).map(entry => `
        <tr class="border-b border-slate-200 text-xs">
            <td class="py-1.5 px-2 font-medium">${escapeHtml(entry.subjectTitle || entry.subject || '')}</td>
            <td class="py-1.5 px-2 text-center">${entry.q1 ?? '-'}</td>
            <td class="py-1.5 px-2 text-center">${entry.q2 ?? '-'}</td>
            <td class="py-1.5 px-2 text-center">${entry.q3 ?? '-'}</td>
            <td class="py-1.5 px-2 text-center">${entry.q4 ?? '-'}</td>
            <td class="py-1.5 px-2 text-center font-semibold">${entry.finalGrade ?? entry.grade ?? '-'}</td>
            <td class="py-1.5 px-2 text-center">${escapeHtml(entry.actionTaken || entry.remarks || 'PASSED')}</td>
        </tr>
    `).join('')

    return `
        <div class="deped-form-container p-6 bg-white font-sans text-slate-900 border border-slate-300 rounded-md max-w-4xl mx-auto my-4">
            <div class="text-center mb-4 border-b pb-3 border-slate-300">
                <p class="text-[10px] tracking-widest uppercase font-bold text-slate-600">Republic of the Philippines • Department of Education</p>
                <p class="text-[11px] font-semibold text-slate-700">${escapeHtml(region)}</p>
                <h2 class="text-base font-bold text-slate-900 tracking-wide mt-1">${escapeHtml(schoolName)}</h2>
                <p class="text-xs text-slate-500">School ID: ${escapeHtml(schoolId)}</p>
                <h3 class="text-sm font-extrabold text-indigo-900 uppercase tracking-wider mt-2 bg-indigo-50 py-1 inline-block px-4 rounded">
                    SF10-JHS / FORM 137: LEARNER'S PERMANENT ACADEMIC RECORD
                </h3>
            </div>

            <div class="grid grid-cols-2 gap-4 text-xs mb-4 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                    <p><span class="font-bold">Learner Name:</span> ${escapeHtml(student?.fullName || student?.name || '')}</p>
                    <p><span class="font-bold">LRN:</span> ${escapeHtml(student?.lrn || student?.lrn_number || '')}</p>
                    <p><span class="font-bold">Date of Birth:</span> ${escapeHtml(student?.dob || student?.date_of_birth || '')}</p>
                </div>
                <div>
                    <p><span class="font-bold">Grade & Section:</span> ${escapeHtml(student?.gradeSection || '')}</p>
                    <p><span class="font-bold">Track / Strand:</span> ${escapeHtml(student?.strand || 'N/A')}</p>
                    <p><span class="font-bold">School Year:</span> ${escapeHtml(student?.schoolYear || '')}</p>
                </div>
            </div>

            <table class="w-full text-left border-collapse border border-slate-300 mb-4">
                <thead>
                    <tr class="bg-slate-100 text-slate-800 text-xs font-bold border-b border-slate-300">
                        <th class="py-2 px-2">Learning Areas / Subjects</th>
                        <th class="py-2 px-2 text-center">Q1</th>
                        <th class="py-2 px-2 text-center">Q2</th>
                        <th class="py-2 px-2 text-center">Q3</th>
                        <th class="py-2 px-2 text-center">Q4</th>
                        <th class="py-2 px-2 text-center">Final Grade</th>
                        <th class="py-2 px-2 text-center">Action Taken</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml || '<tr><td colspan="7" class="text-center py-3 text-slate-400">No grade records found</td></tr>'}
                </tbody>
            </table>

            <div class="flex justify-between items-end mt-8 text-xs text-slate-700">
                <div class="text-center">
                    <div class="w-40 border-b border-slate-400 mb-1"></div>
                    <p class="font-semibold">Class Adviser</p>
                </div>
                <div class="text-center">
                    <div class="w-45 border-b border-slate-400 mb-1"></div>
                    <p class="font-bold">School Registrar / Principal</p>
                </div>
            </div>
        </div>
    `
}