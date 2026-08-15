import { useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { buildBatchKey } from '../lib/batchKey';

const HEADER_MAP = {
  name: 'name', studentname: 'name', fullname: 'name',
  rollno: 'rollNo', roll: 'rollNo', rollnumber: 'rollNo', sno: 'rollNo', no: 'rollNo',
  batch: 'batch', batchname: 'batch', group: 'batch', class: 'batch',
  sport: 'sport', sportname: 'sport', game: 'sport', discipline: 'sport',
  dob: 'dob', dateofbirth: 'dob', birthdate: 'dob', birthday: 'dob',
  gender: 'gender', sex: 'gender',
  height: 'height', heightcm: 'height',
  weight: 'weight', weightkg: 'weight',
  parent: 'parent', parentname: 'parent', guardian: 'parent', guardianname: 'parent',
  contact: 'contact', contact1: 'contact', phone: 'contact', mobile: 'contact', phonenumber: 'contact',
  contact2: 'contact2', phone2: 'contact2', altcontact: 'contact2', alternatecontact: 'contact2',
  school: 'address', schoolname: 'address', college: 'address', address: 'address',
  joindate: 'joinDate', joiningdate: 'joinDate', joined: 'joinDate', dateofjoining: 'joinDate',
};
const normHeader = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function excelDateToIso(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4,5}$/.test(s)) {
    const d = new Date(Math.round((parseFloat(s) - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY -> YYYY-MM-DD
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function rollPrefix(sport, batch) {
  const s = String(sport || '').trim(), b = String(batch || '').trim();
  if (!s || !b) return '';
  return (s[0] + b[0]).toUpperCase();
}

function normalizeGender(val) {
  const s = String(val || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'm' || s === 'male') return 'Male';
  if (s === 'f' || s === 'female') return 'Female';
  return 'Other';
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

export default function ImportStudentsModal({ academyId, sports, batches, existingStudents, onClose, onImported }) {
  const [rows, setRows] = useState(null); // parsed+validated rows, or null before a file is chosen
  const [rejected, setRejected] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const downloadTemplate = () => {
    const headers = ['Name', 'RollNo', 'Sport', 'Batch', 'DOB', 'Gender', 'Height', 'Weight', 'Parent', 'Contact', 'Contact2', 'School', 'JoinDate'];
    const today = new Date().toISOString().slice(0, 10);
    const firstSport = sports[0]?.name || 'Sport A';
    const firstBatch = batches.find(b => b.sport === firstSport)?.batchLabel || 'Batch 1';
    const example1 = ['Arjun Kumar', '', firstSport, firstBatch, '2013-06-15', 'Male', '150', '45', 'Ramesh Kumar', '9876543210', '', 'ABC School', today];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example1]);
    ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    const instr = [
      ['HOW TO USE THIS TEMPLATE'], [''],
      ['1. Fill one row per student. Delete the example row before importing.'],
      ['2. Name, Sport and Batch are required. Sport/Batch must match ones already in the app.'],
      ['3. Leave RollNo blank to auto-generate (Sport initial + Batch initial + number).'],
      ['4. Dates: YYYY-MM-DD or DD/MM/YYYY.'],
      ['5. Gender: Male, Female, or Other (M/F also accepted).'],
      ['6. Height in cm, Weight in kg. Both optional — leave blank if unknown.'],
      ['7. A row matching an existing student (shared contact, or same DOB+parent, or same name+sport+batch when no other info is given) updates that student instead of duplicating.'],
      ['8. A student can appear in multiple rows with different Sport/Batch — each row adds or updates that one enrollment, so a student can end up enrolled in several batches.'],
      ['9. If nothing on the row actually differs from the existing student and enrollment, it is marked "Skip" and left untouched.'],
    ];
    const wsI = XLSX.utils.aoa_to_sheet(instr);
    wsI['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
    XLSX.writeFile(wb, 'Student_Import_Template.xlsx');
  };

  const downloadRejected = () => {
    const headers = ['Name', 'RollNo', 'Sport', 'Batch', 'DOB', 'Gender', 'Height', 'Weight', 'Parent', 'Contact', 'Contact2', 'School', 'JoinDate', 'Reason'];
    const rowsOut = rejected.map(r => [
      r.raw?.Name || '', r.raw?.RollNo || '', r.raw?.Sport || '', r.raw?.Batch || '',
      r.raw?.DOB || '', r.raw?.Gender || '', r.raw?.Height || '', r.raw?.Weight || '',
      r.raw?.Parent || '', r.raw?.Contact || '', r.raw?.Contact2 || '',
      r.raw?.School || '', r.raw?.JoinDate || '', r.reason,
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rowsOut]);
    ws['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 34 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Rejected');
    XLSX.writeFile(wb, 'Rejected_Students.xlsx');
  };

  const parseText = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { setError('File must have a header row and at least one data row.'); return; }
    const headerCols = parseCSVLine(lines[0]);
    const colMap = {};
    headerCols.forEach((h, i) => {
      const key = HEADER_MAP[normHeader(h)];
      if (key && !(key in colMap)) colMap[key] = i;
    });
    if (colMap.name === undefined) { setError('Could not find a "Name" column.'); return; }

    const get = (cols, key) => (colMap[key] !== undefined ? (cols[colMap[key]] || '').trim() : '');
    const parsed = [];
    const rej = [];
    const previewRollNums = existingStudents.map(s => (s.roll_no || '').toUpperCase());

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const name = get(cols, 'name');
      const sportRaw = get(cols, 'sport');
      const batchRaw = get(cols, 'batch');
      const raw = {
        Name: name, RollNo: get(cols, 'rollNo'), Sport: sportRaw, Batch: batchRaw,
        DOB: get(cols, 'dob'), Gender: get(cols, 'gender'), Height: get(cols, 'height'), Weight: get(cols, 'weight'),
        Parent: get(cols, 'parent'), Contact: get(cols, 'contact'),
        Contact2: get(cols, 'contact2'), School: get(cols, 'address'), JoinDate: get(cols, 'joinDate'),
      };
      // Silently skip fully-blank rows — spreadsheet apps often leave empty
      // formatted rows (row-height/styling with no cell data) when a file is
      // re-saved, and those shouldn't count as rejected import rows.
      const isBlankRow = Object.values(raw).every(v => !v);
      if (isBlankRow) continue;

      if (!name) { rej.push({ label: `Row ${i + 1}`, reason: 'Missing name', raw }); continue; }
      const matchedSport = sports.find(s => s.name.toLowerCase() === sportRaw.toLowerCase());
      if (!matchedSport) { rej.push({ label: name, reason: `Sport "${sportRaw}" not found`, raw }); continue; }
      const matchedBatch = batches.find(b => b.sport === matchedSport.name && b.batchLabel.toLowerCase() === batchRaw.toLowerCase());
      if (!matchedBatch) { rej.push({ label: name, reason: `Batch "${batchRaw}" not found under ${matchedSport.name}`, raw }); continue; }

      const dob = excelDateToIso(get(cols, 'dob'));
      const contact = get(cols, 'contact');
      const contact2 = get(cols, 'contact2');
      const parent = get(cols, 'parent');

      // Match against an existing student. Two ways to match:
      //  1. Strong signal: shared contact number, or same DOB + parent name.
      //  2. Fallback: the row has none of that identifying info at all (common in
      //     lightweight rosters) — in that case, match by name + sport + batch so
      //     re-importing the same file updates existing rows instead of duplicating them.
      const match = existingStudents.find(s => {
        if ((s.name || '').toLowerCase() !== name.toLowerCase()) return false;
        const importNums = [contact, contact2].filter(Boolean);
        const existingNums = [s.contact, s.contact2].filter(Boolean);
        const contactOverlap = importNums.length > 0 && existingNums.length > 0 && importNums.some(n => existingNums.includes(n));
        const dobParentMatch = !!(dob && s.dob && parent && s.parent && s.dob === dob && s.parent.toLowerCase() === parent.toLowerCase());
        if (contactOverlap || dobParentMatch) return true;
        const noIdentifyingInfo = !contact && !contact2 && !dob && !parent;
        if (noIdentifyingInfo && s.sport === matchedSport.name && s.batchLabel === matchedBatch.batchLabel) return true;
        return false;
      });

      let rollNo = get(cols, 'rollNo').toUpperCase();
      if (!match) {
        if (rollNo && previewRollNums.includes(rollNo)) rollNo = ''; // clashes, regenerate
        if (!rollNo) {
          const prefix = rollPrefix(matchedSport.name, matchedBatch.batchLabel);
          let maxNum = 0;
          previewRollNums.forEach(rn => {
            if (rn.startsWith(prefix)) {
              const n = parseInt(rn.slice(prefix.length), 10);
              if (!isNaN(n) && n > maxNum) maxNum = n;
            }
          });
          const next = maxNum + 1;
          rollNo = prefix + String(next).padStart(next >= 100 ? 3 : 2, '0');
        }
        previewRollNums.push(rollNo);
      }

      parsed.push({
        _match: match || null,
        name, rollNo, sport: matchedSport.name, batchLabel: matchedBatch.batchLabel,
        dob, gender: normalizeGender(get(cols, 'gender')), height: get(cols, 'height'), weight: get(cols, 'weight'),
        parent, contact, contact2, address: get(cols, 'address'),
        joinDate: excelDateToIso(get(cols, 'joinDate')) || new Date().toISOString().slice(0, 10),
      });
    }

    // Second pass: for matched rows, work out if the import would actually
    // change anything. If every effective field is identical to what's already
    // stored, mark it "no changes" so it's shown/handled as a Skip rather than
    // a pointless Update write.
    parsed.forEach(r => {
      if (!r._match) return;
      const m = r._match;
      const effRollNo = r.rollNo || m.roll_no || '';
      const effContact = r.contact || m.contact || '';
      const effContact2 = r.contact2 || m.contact2 || '';
      const effAddress = r.address || m.address || '';
      const effGender = r.gender || m.gender || '';
      const effHeight = r.height || m.height || '';
      const effWeight = r.weight || m.weight || '';
      const effBatchKey = buildBatchKey(r.sport, r.batchLabel);
      // A student can now hold several enrollments (multiple sport/batch rows),
      // so "no changes" also requires this row's specific sport+batch to
      // already exist for the student — not just that the legacy primary
      // batch field matches.
      const existingEnrollments = m.enrollments && m.enrollments.length > 0
        ? m.enrollments : [{ sport: m.sport, batchLabel: m.batchLabel }];
      const enrollmentExists = existingEnrollments.some(en => en.sport === r.sport && en.batchLabel === r.batchLabel);
      r._noChanges = (
        effRollNo === (m.roll_no || '') &&
        effContact === (m.contact || '') &&
        effContact2 === (m.contact2 || '') &&
        effAddress === (m.address || '') &&
        effGender === (m.gender || '') &&
        effHeight === (m.height || '') &&
        effWeight === (m.weight || '') &&
        effBatchKey === (m.batch || '') &&
        enrollmentExists
      );
    });

    setRows(parsed);
    setRejected(rej);
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

  const inserts = (rows || []).filter(r => !r._match);
  const updates = (rows || []).filter(r => r._match && !r._noChanges);
  const skipped = (rows || []).filter(r => r._match && r._noChanges);

  const submit = async () => {
    const summary = `This will import ${inserts.length + updates.length} student${inserts.length + updates.length === 1 ? '' : 's'}:\n\n` +
      `• New: ${inserts.length}\n• Update: ${updates.length}\n• Skip (no changes): ${skipped.length}\n• Rejected: ${rejected.length}\n\nContinue?`;
    if (!window.confirm(summary)) return;

    setSubmitting(true);
    if (inserts.length) {
      const payload = inserts.map(r => ({
        academy_id: academyId, name: r.name, roll_no: r.rollNo,
        batch: buildBatchKey(r.sport, r.batchLabel), dob: r.dob || null, gender: r.gender || null,
        height: r.height || null, weight: r.weight || null, parent: r.parent || null,
        contact: r.contact || null, contact2: r.contact2 || null, address: r.address || null,
        join_date: r.joinDate,
      }));
      const { data: savedRows, error: insErr } = await supabase.from('students').insert(payload).select();
      if (!insErr && savedRows) {
        const enrollRows = savedRows.map((row, i) => ({
          academy_id: academyId, student_id: row.id, sport: inserts[i].sport, batch: inserts[i].batchLabel,
          join_date: inserts[i].joinDate, active: true,
        }));
        await supabase.from('enrollments').upsert(enrollRows, { onConflict: 'student_id,sport,batch' });
      }
    }
    for (const r of updates) {
      await supabase.from('students').update({
        roll_no: r.rollNo || r._match.roll_no,
        batch: buildBatchKey(r.sport, r.batchLabel),
        contact: r.contact || r._match.contact, contact2: r.contact2 || r._match.contact2,
        address: r.address || r._match.address, gender: r.gender || r._match.gender,
        height: r.height || r._match.height, weight: r.weight || r._match.weight,
      }).eq('id', r._match.id);
      // Upsert rather than overwrite: adds/refreshes this row's sport+batch
      // enrollment without touching the student's other enrollments.
      await supabase.from('enrollments').upsert({
        academy_id: academyId, student_id: r._match.id, sport: r.sport, batch: r.batchLabel,
        join_date: r.joinDate, active: true,
      }, { onConflict: 'student_id,sport,batch' });
    }
    setSubmitting(false);
    onImported();
    onClose();
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,.55)', zIndex: 9999 }}>
      <div style={{ background: 'var(--card)', width: '100%', maxWidth: 480, margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--card2)' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>⬆️ Import Students</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button className="btn btn-outline btn-sm" onClick={downloadTemplate}>📥 Download Template</button>

          <div>
            <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gray)', display: 'block', marginBottom: 6 }}>Choose file (.csv, .xlsx, .xls)</label>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="form-input" />
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(220,38,38,.08)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 8, padding: '8px 10px' }}>⚠️ {error}</div>}

          {rows && (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray)' }}>New</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--green, #16a34a)' }}>{inserts.length}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray)' }}>Update</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--accent2)' }}>{updates.length}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray)' }}>Skip</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--gray)' }}>{skipped.length}</div>
                </div>
                <div className="card" style={{ flex: 1, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--gray)' }}>Rejected</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: '#dc2626' }}>{rejected.length}</div>
                </div>
              </div>

              {rejected.length > 0 && (
                <button className="btn btn-outline btn-sm" onClick={downloadRejected} style={{ alignSelf: 'flex-start' }}>
                  ⬇️ Export Rejected ({rejected.length}) to fix & re-upload
                </button>
              )}

              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map((r, i) => (
                  <div key={i} className="card" style={{ padding: 10, fontSize: 12.5 }}>
                    <strong>{r.name}</strong> · {r.rollNo} · {r.sport}/{r.batchLabel}{r.gender ? ` · ${r.gender}` : ''}{r.height ? ` · ${r.height}cm` : ''}{r.weight ? ` · ${r.weight}kg` : ''}
                    <span style={{
                      float: 'right', fontWeight: 700,
                      color: r._noChanges ? 'var(--gray)' : r._match ? 'var(--accent2)' : 'var(--green, #16a34a)',
                    }}>
                      {r._noChanges ? 'Skip' : r._match ? 'Update' : 'New'}
                    </span>
                  </div>
                ))}
                {rejected.map((r, i) => (
                  <div key={'r' + i} className="card" style={{ padding: 10, fontSize: 12.5, opacity: .7 }}>
                    <strong>{r.label}</strong> — {r.reason}
                    <span style={{ float: 'right', fontWeight: 700, color: '#dc2626' }}>Skipped</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {rows && (inserts.length > 0 || updates.length > 0) && (
          <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--card2)' }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1.4 }} onClick={submit} disabled={submitting}>
              {submitting ? 'Importing…' : `Import ${inserts.length + updates.length} Students`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
