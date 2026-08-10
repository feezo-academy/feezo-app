import { useMemo, useState } from 'react';
import { useAcademyData } from '../context/AcademyDataContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import AddStudentModal from '../components/AddStudentModal';
import StudentDetailModal from '../components/StudentDetailModal';
import ImportStudentsModal from '../components/ImportStudentsModal';
import { exportStudentsPdf, exportStudentsXlsx } from '../lib/exporters';

export default function StudentsTab() {
  const { visibleStudents, visibleSports, visibleBatches, refresh } = useAcademyData();
  const { isAdmin, academyId } = useAuth();
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sortBy, setSortBy] = useState('roll_asc');
  const [selected, setSelected] = useState(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [detailStudent, setDetailStudent] = useState(null);
  const [editStudent, setEditStudent] = useState(null);

  const filtered = useMemo(() => {
    let list = visibleStudents.filter(s => {
      if (sportFilter && s.sport !== sportFilter) return false;
      if (batchFilter && s.batch !== batchFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(s.name?.toLowerCase().includes(q) || s.roll_no?.toLowerCase?.().includes(q))) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'roll_desc': return (b.roll_no || '').localeCompare(a.roll_no || '');
        case 'name_az': return (a.name || '').localeCompare(b.name || '');
        case 'name_za': return (b.name || '').localeCompare(a.name || '');
        default: return (a.roll_no || '').localeCompare(b.roll_no || '');
      }
    });
    return list;
  }, [visibleStudents, sportFilter, batchFilter, search, sortBy]);

  const batchesForSport = visibleBatches.filter(b => !sportFilter || b.sport === sportFilter);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
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
          <div style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 12, background: 'var(--card2)', color: 'var(--gray)' }}>
            {visibleStudents.length} total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-gold btn-sm" onClick={() => exportStudentsPdf(filtered)}>PDF</button>
          <button className="btn btn-success btn-sm" onClick={() => exportStudentsXlsx(filtered)}>XL</button>
          {isAdmin && <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>⬆️ Import</button>}
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Add</button>}
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
            value={sportFilter} onChange={e => { setSportFilter(e.target.value); setBatchFilter(''); }}>
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

      {isAdmin && selected.size > 0 && (
        <div style={{ background: 'var(--accent)', border: '1px solid var(--accent2)', borderRadius: 10, padding: '9px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{selected.size} selected</div>
          <button className="btn btn-xs btn-outline" onClick={() => setSelected(new Set())} style={{ fontSize: 11 }}>✕ Deselect All</button>
          <button className="btn btn-xs" onClick={bulkDelete} style={{ fontSize: 11, background: 'var(--red)', color: '#fff', border: 'none' }}>🗑️ Delete</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 90, marginTop: 4 }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 30 }}>No students found.</div>}
        {filtered.map(s => (
          <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, cursor: 'pointer' }}
            onClick={(e) => { if (e.target.type !== 'checkbox') setDetailStudent(s); }}>
            {isAdmin && (
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} onClick={e => e.stopPropagation()} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{s.name} <span style={{ color: 'var(--gray)', fontWeight: 500, fontSize: 12 }}>#{s.roll_no}</span></div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{s.sport} · {s.batchLabel}</div>
              {s.contact && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>📞 {s.contact}</div>}
            </div>
            <span style={{ color: 'var(--gray)' }}>›</span>
          </div>
        ))}
      </div>

      {showAdd && (
        <AddStudentModal
          academyId={academyId}
          sports={visibleSports}
          batches={visibleBatches}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
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
          onClose={() => setEditStudent(null)}
          onSaved={() => { setEditStudent(null); refresh(); }}
        />
      )}
    </div>
  );
}
