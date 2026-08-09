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
