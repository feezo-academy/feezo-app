import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// canViewContact gates the phone number columns, matching the same permission
// used in the Students list / detail view — staff without contact access
// shouldn't be able to get phone numbers via export either.
// achievementsByStudent: { [studentId]: Array<{event_name, level, result, achievement_date}> }
function achievementSummary(list) {
  if (!list || list.length === 0) return '';
  return list.map(a => {
    const bits = [a.event_name, a.result, a.level, a.achievement_date].filter(Boolean);
    return bits.join(' - ');
  }).join('; ');
}

export function exportStudentsPdf(students, canViewContact = true, achievementsByStudent = {}) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.text('Student List', 14, 14);
  const head = ['Roll No', 'Name', 'Sport', 'Batch', 'DOB', 'Age', 'Gender', 'Parent/Guardian'];
  if (canViewContact) head.push('Contact 1', 'Contact 2');
  head.push('School', 'Joined', 'Status', 'Achievements');
  autoTable(doc, {
    startY: 20,
    styles: { fontSize: 8 },
    columnStyles: { [head.length - 1]: { cellWidth: 60 } },
    head: [head],
    body: students.map(s => {
      const row = [
        s.roll_no || '', s.name || '', s.sport || '', s.batchLabel || '',
        s.dob || '', s.dob ? '' : (s.age || ''), s.gender || '', s.parent || '',
      ];
      if (canViewContact) row.push(s.contact || '', s.contact2 || '');
      row.push(s.address || '', s.join_date || '', s.banned ? 'Dropout' : 'Active');
      row.push(achievementSummary(achievementsByStudent[s.id]));
      return row;
    }),
  });
  doc.save('students.pdf');
}

export function exportStudentsXlsx(students, canViewContact = true, achievementsByStudent = {}) {
  const ws = XLSX.utils.json_to_sheet(students.map(s => {
    const row = {
      RollNo: s.roll_no || '', Name: s.name || '', Sport: s.sport || '', Batch: s.batchLabel || '',
      DOB: s.dob || '', Age: s.dob ? '' : (s.age || ''), Gender: s.gender || '', Parent: s.parent || '',
    };
    if (canViewContact) { row.Contact = s.contact || ''; row.Contact2 = s.contact2 || ''; }
    row.School = s.address || '';
    row.JoinDate = s.join_date || '';
    row.Status = s.banned ? 'Dropout' : 'Active';
    const list = achievementsByStudent[s.id] || [];
    row.AchievementCount = list.length;
    row.Achievements = achievementSummary(list);
    return row;
  }));
  ws['!cols'] = [
    { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 9 }, { wch: 18 },
    ...(canViewContact ? [{ wch: 13 }, { wch: 13 }] : []),
    { wch: 20 }, { wch: 12 }, { wch: 9 }, { wch: 10 }, { wch: 50 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'students.xlsx');
}

export function exportGenericXlsx(rows, filename, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function exportGenericPdf(title, columns, rows, filename) {
  const doc = new jsPDF();
  doc.text(title, 14, 14);
  autoTable(doc, { startY: 20, head: [columns], body: rows });
  doc.save(filename);
}
