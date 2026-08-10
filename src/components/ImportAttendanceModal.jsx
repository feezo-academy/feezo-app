import { useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';

const HEADER_MAP = {
  name: 'name', studentname: 'name', fullname: 'name',
  rollno: 'rollNo', roll: 'rollNo', rollnumber: 'rollNo', sno: 'rollNo', no: 'rollNo',
  sport: 'sport', sportname: 'sport', game: 'sport', discipline: 'sport',
  batch: 'batch', batchname: 'batch', group: 'batch', class: 'batch',
};
const normHeader = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// A date-column header looks like DD/MM/YYYY (also accepts DD-MM-YYYY).
const DATE_HEADER_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
function parseHeaderDate(h) {
  const m = String(h || '').trim().match(DATE_HEADER_RE);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function formatDDMMYYYY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseCSVLine(line) {
  const cols = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

export default function ImportAttendanceModal({ academyId, existingStudents, sportFilter, batchFilter, onClose, onImported }) {
  const [preview, setPreview] = useState(null); // { dateColumns, studentRows, markCount, rejected }
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const downloadTemplate = () => {
    // Sample data comes from the admin/staff's own visible students, preferring
    // the currently filtered sport/batch, otherwise the first sport+batch found.
    let sampleSource = existingStudents;
    if (sportFilter) sampleSource = sampleSource.filter(s => s.sport === sportFilter);
    if (batchFilter) sampleSource = sampleSource.filter(s => s.batch === batchFilter);
    if (!sampleSource.length) {
      const firstSport = existingStudents[0]?.sport;
      const firstBatch = existingStudents.find(s => s.sport === firstSport)?.batch;
      sampleSource = existingStudents.filter(s => s.sport === firstSport && s.batch === firstBatch);
    }
    const sample = sampleSource.slice(0, 2);

    const today = new Date();
    const tomorrow = new Date(Date.now() + 86400000);
    const d1 = formatDDMMYYYY(today.toISOString().slice(0, 10));
    const d2 = formatDDMMYYYY(tomorrow.toISOString().slice(0, 10));
    const headers = ['Name', 'RollNo', 'Sport', 'Batch', d1, d2];

    const rows = sample.length
      ? sample.map((s, i) => [s.name, s.roll_no, s.sport, s.batchLabel, i === 0 ? 'P' : 'A', i === 0 ? 'A' : 'P'])
      : [['Student Name', 'Roll No', 'Sport', 'Batch', 'P', 'A']];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const instr = [
      ['HOW TO USE THIS TEMPLATE'], [''],
      ['1. Name or RollNo is required to identify the student.'],
      ["2. Batch must exactly match the student's batch in the app \u2014 rows are skipped if it doesn't."],
      ['3. Add one column per date to mark, with the header as DD/MM/YYYY (e.g. 15/06/2025).'],
      ['4. Fill each date column with P for Present, A for Absent. Leave a cell blank to skip that student for that date.'],
      ['5. First row is treated as header and skipped.'],
    ];
    const wsI = XLSX.utils.aoa_to_sheet(instr);
    wsI['!cols'] = [{ wch: 78 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
    XLSX.writeFile(wb, 'Attendance_Import_Template.xlsx');
  };

  const parseText = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setError('File must have a header row and at least one data row.'); return; }
    const headerCols = parseCSVLine(lines[0]);
    const colMap = {};
    const dateCols = []; // { index, iso }
    headerCols.forEach((h, i) => {
      const key = HEADER_MAP[normHeader(h)];
      if (key && !(key in colMap)) { colMap[key] = i; return; }
      const iso = parseHeaderDate(h);
      if (iso) dateCols.push({ index: i, iso });
    });
    if (colMap.name === undefined && colMap.rollNo === undefined) {
      setError('Could not find a "Name" or "RollNo" column.'); return;
    }
    if (!dateCols.length) {
      setError('No date columns found. Headers must be in DD/MM/YYYY format.'); return;
    }

    const get = (cols, key) => (colMap[key] !== undefined ? (cols[colMap[key]] || '').trim() : '');
    const studentRows = []; // { student, marks: [{iso, status}] }
    const rejected = [];
    let markCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const name = get(cols, 'name');
      const rollNo = get(cols, 'rollNo');
      const sportRaw = get(cols, 'sport');
      const batchRaw = get(cols, 'batch');
      if (!name && !rollNo) { rejected.push({ label: `Row ${i + 1}`, reason: 'Missing Name and RollNo' }); continue; }

      let student = null;
      if (rollNo) student = existingStudents.find(s => (s.roll_no || '').toLowerCase() === rollNo.toLowerCase());
      if (!student && name) {
        const matches = existingStudents.filter(s => (s.name || '').toLowerCase() === name.toLowerCase());
        student = matches.length === 1 ? matches[0] : matches.find(s =>
          (!batchRaw || s.batchLabel?.toLowerCase() === batchRaw.toLowerCase()) &&
          (!sportRaw || s.sport?.toLowerCase() === sportRaw.toLowerCase())
        );
      }
      if (!student) { rejected.push({ label: name || rollNo, reason: 'Student not found' }); continue; }

      if (batchRaw && student.batchLabel?.toLowerCase() !== batchRaw.toLowerCase()) {
        rejected.push({ label: student.name, reason: `Batch "${batchRaw}" doesn't match student's batch (${student.batchLabel})` });
        continue;
      }
      if (sportRaw && student.sport?.toLowerCase() !== sportRaw.toLowerCase()) {
        rejected.push({ label: student.name, reason: `Sport "${sportRaw}" doesn't match student's sport (${student.sport})` });
        continue;
      }

      const marks = [];
      dateCols.forEach(dc => {
        const val = (cols[dc.index] || '').trim().toUpperCase();
        if (val === 'P') { marks.push({ iso: dc.iso, status: 'present' }); markCount++; }
        else if (val === 'A') { marks.push({ iso: dc.iso, status: 'absent' }); markCount++; }
        // blank or anything else -> skip that cell
      });
      if (marks.length) studentRows.push({ student, marks });
    }

    setPreview({ dateColumns: dateCols.map(d => d.iso), studentRows, markCount, rejected });
    setError('');
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    if (ext === 'csv') {
      reader.onload = ev => parseText(ev.target.result);
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = ev => {
        try {
          const wb = XLSX.read(ev.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          parseText(XLSX.utils.sheet_to_csv(ws));
        } catch (err) { setError('Could not read Excel file: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError('Please choose a .csv, .xlsx or .xls file.');
    }
  };

  const submit = async () => {
    if (!preview?.studentRows.length) return;
    setSubmitting(true);
    const payload = [];
    preview.studentRows.forEach(({ student, marks }) => {
      marks.forEach(m => {
        payload.push({
          academy_id: academyId, student_id: student.id, date: m.iso,
          status: m.status, sport: student.sport,
        });
      });
    });
    // Upsert in chunks to stay well under request size limits.
    for (let i = 0; i < payload.length; i += 500) {
      await supabase.from('attendance').upsert(payload.slice(i, i + 500), { onConflict: 'academy_id,student_id,date' });
    }
    setSubmitting(false);
    onImported();
    onClose();
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999 }}>
      <div style={{ background: 'var(--card)', width: '100%', maxWidth: 480, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--card2)' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>⬆️ Import Attendance</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: 12.5, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>📋 Required CSV/Excel format:</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--gray)', marginBottom: 8, wordBreak: 'break-all' }}>
              Name, RollNo, Sport, Batch, DD/MM/YYYY, DD/MM/YYYY, ...
            </div>
            <div>• <strong>Name</strong> or <strong>RollNo</strong> is required to identify the student.</div>
            <div>• <strong>Batch</strong> must exactly match the student's batch in the app — rows are skipped if it doesn't.</div>
            <div>• Add one column per date to mark, with the header as <strong>DD/MM/YYYY</strong> (e.g. 15/06/2025).</div>
            <div>• Fill each date column with <strong>P</strong> for Present, <strong>A</strong> for Absent. Leave a cell blank to skip that student for that date.</div>
            <div>• First row treated as header and skipped.</div>
          </div>

          <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>📥 Download Excel Template</button>

          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>Choose CSV or Excel File</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="form-input" />
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 8, padding: '8px 10px' }}>⚠️ {error}</div>}

          {preview && (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>Students</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green, #16a34a)' }}>{preview.studentRows.length}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>Marks</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent2)' }}>{preview.markCount}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--gray)' }}>Rejected</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#dc2626' }}>{preview.rejected.length}</div>
                </div>
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {preview.studentRows.map((r, i) => (
                  <div key={i} className="card" style={{ padding: 10, fontSize: 12.5 }}>
                    <strong>{r.student.name}</strong> · #{r.student.roll_no} · {r.student.sport}/{r.student.batchLabel}
                    <span style={{ float: 'right', fontWeight: 700, color: 'var(--green, #16a34a)' }}>{r.marks.length} day(s)</span>
                  </div>
                ))}
                {preview.rejected.map((r, i) => (
                  <div key={'r' + i} className="card" style={{ padding: 10, fontSize: 12.5, opacity: .7 }}>
                    <strong>{r.label}</strong> — {r.reason}
                    <span style={{ float: 'right', fontWeight: 700, color: '#dc2626' }}>Skipped</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {preview && preview.studentRows.length > 0 && (
          <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--card2)' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={submit} disabled={submitting}>
              {submitting ? 'Importing…' : `Import ${preview.markCount} Marks`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
