import { useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import LimitGatedButton from '../components/LimitGatedButton';
import { supabase } from '../lib/supabaseClient';
import AddStudentModal from '../components/AddStudentModal';
import StudentDetailModal from '../components/StudentDetailModal';
import ImportStudentsModal from '../components/ImportStudentsModal';
import BulkEditStudentsModal from '../components/BulkEditStudentsModal';
import { exportStudentsPdf, exportStudentsXlsx } from '../lib/exporters';

// Natural sort for roll numbers like "SM1", "SM2", "SM10" — plain string
// comparison would wrongly put "SM10" before "SM2". This splits into the
// letter prefix and numeric part and compares the number numerically.
function compareRollNo(a, b) {
  const ra = String(a || '');
  const rb = String(b || '');
  const pa = ra.match(/^(\D*)(\d*)/);
  const pb = rb.match(/^(\D*)(\d*)/);
  const prefixCmp = (pa[1] || '').localeCompare(pb[1] || '');
  if (prefixCmp !== 0) return prefixCmp;
  const na = pa[2] ? parseInt(pa[2], 10) : NaN;
  const nb = pb[2] ? parseInt(pb[2], 10) : NaN;
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return ra.localeCompare(rb);
}

function RollBadge({ rollNo }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 34, height: 24, padding: '0 8px', borderRadius: 8,
      background: 'var(--accent2)', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0,
    }}>
      {rollNo || '+Roll'}
    </span>
  );
}


export default function StudentsTab() {
  const { visibleStudents, students, visibleSports, visibleBatches, refresh } = useAcademyData();
  const { isAdmin, academyId, canViewContact, canExport } = useAuth();
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sortBy, setSortBy] = useState('roll_asc');
  const [selected, setSelected] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [detailStudent, setDetailStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);

  const filtered = useMemo(() => {
    let list = visibleStudents.filter(s => {
      if (sportFilter && !s.enrollments.some(en => en.sport === sportFilter)) return false;
      if (batchFilter && !s.enrollments.some(en => en.batch === batchFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.name?.toLowerCase().includes(q) || s.roll_no?.toLowerCase?.().includes(q))) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'roll_desc': return compareRollNo(b.roll_no, a.roll_no);
        case 'name_az': return (a.name || '').localeCompare(b.name || '');
        case 'name_za': return (b.name || '').localeCompare(a.name || '');
        default: return compareRollNo(a.roll_no, b.roll_no);
      }
    });
    return list;
  }, [visibleStudents, sportFilter, batchFilter, search, sortBy]);

  // Dropped (banned) students sink to the bottom under their own section.
  const activeList = useMemo(() => filtered.filter(s => !s.banned), [filtered]);
  const droppedList = useMemo(() => filtered.filter(s => s.banned), [filtered]);

  const batchesForSport = visibleBatches.filter(b => !sportFilter || b.sport === sportFilter);

  // Active and Dropped are selected as two separate groups — selecting a
  // checkbox in one group clears whatever was selected in the other, so
  // "select all" / bulk actions never mix active with dropped students.
  const activeIdSet = useMemo(() => new Set(activeList.map(s => s.id)), [activeList]);
  const droppedIdSet = useMemo(() => new Set(droppedList.map(s => s.id)), [droppedList]);
  const selectedGroup = useMemo(() => {
    if (selected.size === 0) return null;
    for (const id of selected) { if (droppedIdSet.has(id)) return 'dropped'; }
    return 'active';
  }, [selected, droppedIdSet]);

  const toggleSelect = (id, group) => {
    setSelected(prev => {
      // Switching groups mid-selection: start a fresh selection in the new group.
      if (prev.size > 0 && selectedGroup && selectedGroup !== group) {
        return new Set([id]);
      }
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const list = selectedGroup === 'dropped' ? droppedList : activeList;
    setSelected(new Set(list.map(s => s.id)));
  };

  const bulkDelete = async () => {
    if (!isAdmin) return; // UI already hides this from staff; guard kept in case of direct calls
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} student(s)?`)) return;
    await supabase.from('students').delete().in('id', Array.from(selected));
    setSelected(new Set());
    refresh();
  };

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="section-title" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>👥 Students</div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 12, background: 'var(--card2)', color: 'var(--gray)' }}>
                {(sportFilter || batchFilter || search)
                  ? `${activeList.length} active of ${visibleStudents.filter(s => !s.banned).length}`
                  : `${visibleStudents.filter(s => !s.banned).length} active`}
              </div>
              {visibleStudents.some(s => s.banned) && (
                <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 12, background: 'rgba(220,38,38,.12)', color: '#ef4444' }}>
                  {(sportFilter || batchFilter || search)
                    ? `${droppedList.length} dropped of ${visibleStudents.filter(s => s.banned).length}`
                    : `${visibleStudents.filter(s => s.banned).length} dropped`}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canExport && <button className="btn btn-gold btn-sm" onClick={() => exportStudentsPdf(filtered)}>PDF</button>}
          {canExport && <button className="btn btn-success btn-sm" onClick={() => exportStudentsXlsx(filtered)}>XL</button>}
          <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>⬆️ Import</button>
          <LimitGatedButton
            resource="students"
            currentCount={students.length}
            onClick={() => setShowAdd(true)}
            className="btn btn-primary btn-sm"
          >
            + Add
          </LimitGatedButton>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
        <div className="search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" className="search-input" placeholder="Search by name or roll number…"
            value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button type="button" className="search-clear-btn" onClick={() => setSearch('')} aria-label="Clear search">✕</button>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
            value={sportFilter} onChange={e => {
              const newSport = e.target.value;
              setSportFilter(newSport);
              const firstBatch = visibleBatches.find(b => b.sport === newSport);
              setBatchFilter(newSport ? (firstBatch ? firstBatch.name : '') : '');
            }}>
            <option value="">All Sports</option>
            {visibleSports.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <select className="form-select" style={{ flex: 1, minWidth: 110, fontSize: 12, padding: '7px 9px' }}
            value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
            <option value="">All Batches</option>
            {batchesForSport.map(b => <option key={b.id} value={b.name}>{b.batchLabel}</option>)}
          </select>
          <select className="form-select" style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '7px 9px' }}
            value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="roll_asc">Roll No ↑</option>
            <option value="roll_desc">Roll No ↓</option>
            <option value="name_az">Name A→Z</option>
            <option value="name_za">Name Z→A</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div style={{ background: 'var(--accent)', border: '1px solid var(--accent2)', borderRadius: 10, padding: '7px 8px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>{selected.size} selected</div>
          <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 4 }}>
            <button
              onClick={selectAll}
              disabled={selected.size === (selectedGroup === 'dropped' ? droppedList.length : activeList.length)}
              style={{ minWidth: 0, fontSize: 10, fontWeight: 700, padding: '6px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1.5px solid #000', borderRadius: 6, background: '#fff', color: '#000', opacity: selected.size === (selectedGroup === 'dropped' ? droppedList.length : activeList.length) ? 0.5 : 1 }}
            >
              ☑ All
            </button>
            <button
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
              style={{ minWidth: 0, fontSize: 10, fontWeight: 700, padding: '6px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1.5px solid #000', borderRadius: 6, background: '#fff', color: '#000', opacity: selected.size === 0 ? 0.5 : 1 }}
            >
              ✕ None
            </button>
            <button
              onClick={() => setShowBulkEdit(true)}
              disabled={selected.size === 0}
              style={{ minWidth: 0, fontSize: 10, fontWeight: 700, padding: '6px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1.5px solid #000', borderRadius: 6, background: 'var(--primary, #4f6bed)', color: '#fff', opacity: selected.size === 0 ? 0.5 : 1 }}
            >
              {selectedGroup === 'dropped' ? '↩️ Restore' : '✏️ Edit'}
            </button>
            {isAdmin && (
              <button
                onClick={bulkDelete}
                disabled={selected.size === 0}
                style={{ minWidth: 0, fontSize: 10, fontWeight: 700, padding: '6px 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1.5px solid #000', borderRadius: 6, background: 'var(--red)', color: '#fff', opacity: selected.size === 0 ? 0.5 : 1 }}
              >
                🗑️ Del
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, marginTop: 4 }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students found.</div>}
        {activeList.map(s => (
          <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, cursor: 'pointer' }}
            onClick={(e) => { if (e.target.type !== 'checkbox') setDetailStudent(s); }}>
            {isAdmin && (
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id, 'active')} onClick={e => e.stopPropagation()} />
            )}
            <RollBadge rollNo={s.roll_no} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</div>
            </div>
            <span style={{ color: 'var(--gray)' }}>›</span>
          </div>
        ))}

        {droppedList.length > 0 && (
          <>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.6px', margin: '18px 0 10px' }}>
              — Dropout / Banned Students —
            </div>
            {droppedList.map(s => (
              <div key={s.id} className="card" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, cursor: 'pointer',
                background: 'rgba(220,38,38,.05)', border: '1px solid rgba(220,38,38,.25)',
              }}
                onClick={(e) => { if (e.target.type !== 'checkbox') setDetailStudent(s); }}>
                {isAdmin && (
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id, 'dropped')} onClick={e => e.stopPropagation()} />
                )}
                <RollBadge rollNo={s.roll_no} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {s.name}
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(220,38,38,.12)', color: '#ef4444' }}>Dropout</span>
                  </div>
                </div>
                <span style={{ color: 'var(--gray)' }}>›</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showAdd && (
        <AddStudentModal
          academyId={academyId}
          sports={visibleSports}
          batches={visibleBatches}
          existingStudents={visibleStudents}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}

      {showBulkEdit && (
        <BulkEditStudentsModal
          students={visibleStudents}
          selectedIds={selected}
          allStudents={visibleStudents}
          sports={visibleSports}
          batches={visibleBatches}
          academyId={academyId}
          mode={selectedGroup}
          onClose={() => setShowBulkEdit(false)}
          onSaved={() => { setShowBulkEdit(false); setSelected(new Set()); refresh(); }}
        />
      )}

      {showImport && (
        <ImportStudentsModal
          academyId={academyId}
          sports={visibleSports}
          batches={visibleBatches}
          existingStudents={visibleStudents}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}

      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          academyId={academyId}
          isAdmin={isAdmin}
          canViewContact={canViewContact}
          onClose={() => setDetailStudent(null)}
          onEdit={(s) => setEditStudent(s)}
          onChanged={refresh}
        />
      )}

      {editStudent && (
        <AddStudentModal
          academyId={academyId}
          sports={visibleSports}
          batches={visibleBatches}
          student={editStudent}
          existingStudents={visibleStudents}
          onClose={() => setEditStudent(null)}
          onSaved={() => { setEditStudent(null); refresh(); }}
        />
      )}
    </div>
  );
}
