import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function exportStudentsPdf(students) {
  const doc = new jsPDF();
  doc.text('Student List', 14, 14);
  autoTable(doc, {
    startY: 20,
    head: [['Roll No', 'Name', 'Sport', 'Batch']],
    body: students.map(s => [s.roll_no, s.name, s.sport, s.batch]),
  });
  doc.save('students.pdf');
}

export function exportStudentsXlsx(students) {
  const ws = XLSX.utils.json_to_sheet(students.map(s => ({
    RollNo: s.roll_no, Name: s.name, Sport: s.sport, Batch: s.batch, Phone: s.phone,
  })));
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

// Attendance exports take pre-built row arrays so the PDF and XLSX always
// show identical columns in identical order (day view or period-summary view).
export function exportAttendancePdf(title, columns, rows, filename) {
  const doc = new jsPDF();
  doc.text(title, 14, 14);
  autoTable(doc, { startY: 20, head: [columns], body: rows, styles: { fontSize: 8.5 } });
  doc.save(filename);
}

export function exportAttendanceXlsx(columns, rows, filename, sheetName = 'Attendance') {
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
  ws['!cols'] = columns.map(() => ({ wch: 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
