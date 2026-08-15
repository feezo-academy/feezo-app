import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Uses the global `Chart` object loaded via CDN script tag in index.html:
// <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
// No npm install required.

const PRESENT_STATUS = 'P';
const BLUE = '#2563eb';
const BLUE_LIGHT = '#93c5fd';
const TRACK = '#e2e8f0';

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#f59e0b' };
  if (bmi < 25) return { label: 'Normal', color: '#22c55e' };
  if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
  return { label: 'Obese', color: '#ef4444' };
}

const TABS = [
  { key: 'points', label: '🏆 Points' },
  { key: 'attendance', label: '📆 Attendance' },
  { key: 'progress', label: '📈 Progress' },
];

// centered-text plugin for doughnut/gauge charts
const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const opts = chart.config.options.plugins?.centerText;
    if (!opts) return;
    const { ctx, chartArea: { left, right, top, bottom } } = chart;
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.fillStyle = opts.color || BLUE;
    ctx.fillText(opts.mainText, cx, cy - 8);
    ctx.font = '400 11px system-ui, sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(opts.subText, cx, cy + 12);
    ctx.restore();
  },
};

function useChart(canvasRef, buildConfig, deps) {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined' || !window.Chart) return;
    const Chart = window.Chart;
    if (!Chart.registry.plugins.get('centerText')) {
      Chart.register(centerTextPlugin);
    }
    const config = buildConfig();
    if (!config) return;
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), config);
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export default function StudentChartsModal({
  row, academyId, userId, userName, canEdit,
  totalPoints, earnedPoints, pointsRecords, challenges,
  attendanceRecords, onClose,
}) {
  const [tab, setTab] = useState('points');
  const [chartReady, setChartReady] = useState(typeof window !== 'undefined' && !!window.Chart);

  // poll briefly in case the CDN script is still loading on first paint
  useEffect(() => {
    if (chartReady) return;
    const id = setInterval(() => {
      if (window.Chart) { setChartReady(true); clearInterval(id); }
    }, 150);
    return () => clearInterval(id);
  }, [chartReady]);

  // ---------- Points tab data ----------
  const challengeById = useMemo(() => {
    const m = {};
    challenges.forEach(c => { m[c.id] = c; });
    return m;
  }, [challenges]);

  const pointsList = useMemo(() => {
    return pointsRecords
      .filter(p => challengeById[p.challenge_id])
      .map(p => ({
        id: p.id,
        challengeName: challengeById[p.challenge_id]?.name || 'Challenge',
        points: Number(p.points_awarded || 0),
        date: p.awarded_at || p.created_at,
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [pointsRecords, challengeById]);

  const pointsPct = totalPoints ? Math.min(100, (earnedPoints / totalPoints) * 100) : 0;

  // ---------- Attendance tab data ----------
  const presentDays = attendanceRecords.filter(a => (a.status || '').toUpperCase() === PRESENT_STATUS).length;
  const totalDays = attendanceRecords.length;
  const absentDays = Math.max(0, totalDays - presentDays);

  // ---------- Progress (BMI) tab data ----------
  const [metrics, setMetrics] = useState([]);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMetrics = async () => {
    if (!academyId || !row?.student?.id) return;
    setLoadingMetrics(true);
    const { data, error } = await supabase
      .from('student_body_metrics')
      .select('*')
      .eq('academy_id', academyId)
      .eq('student_id', row.student.id)
      .order('recorded_at', { ascending: true });
    if (!error) setMetrics(data || []);
    setLoadingMetrics(false);
  };
  useEffect(() => { loadMetrics(); }, [academyId, row?.student?.id]); // eslint-disable-line

  const bmiSeries = useMemo(() => {
    return metrics.map(m => ({
      date: (m.recorded_at || '').slice(0, 10),
      bmi: m.height_cm ? Number((m.weight_kg / Math.pow(m.height_cm / 100, 2)).toFixed(1)) : null,
    })).filter(m => m.bmi);
  }, [metrics]);

  const latest = bmiSeries[bmiSeries.length - 1];
  const latestCategory = latest ? bmiCategory(latest.bmi) : null;

  const saveMetric = async () => {
    const h = Number(height), w = Number(weight);
    if (!h || !w) { alert('Enter both height (cm) and weight (kg).'); return; }
    setSaving(true);
    const { error } = await supabase.from('student_body_metrics').insert({
      academy_id: academyId,
      student_id: row.student.id,
      height_cm: h,
      weight_kg: w,
      recorded_by_id: userId,
      recorded_by_name: userName,
      recorded_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { alert('Failed to save: ' + error.message); return; }
    setHeight(''); setWeight('');
    loadMetrics();
  };

  // ---------- chart instances ----------
  const pointsCanvasRef = useRef(null);
  const attendanceCanvasRef = useRef(null);
  const bmiCanvasRef = useRef(null);

  useChart(pointsCanvasRef, () => {
    if (tab !== 'points' || !chartReady) return null;
    return {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [pointsPct, 100 - pointsPct],
          backgroundColor: [BLUE, TRACK],
          borderWidth: 0,
        }],
      },
      options: {
        cutout: '75%',
        circumference: 360,
        rotation: -90,
        animation: { animateRotate: true, duration: 900, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          centerText: { mainText: `${earnedPoints}`, subText: `of ${totalPoints} pts`, color: BLUE },
        },
      },
    };
  }, [tab, chartReady, earnedPoints, totalPoints, pointsPct]);

  useChart(attendanceCanvasRef, () => {
    if (tab !== 'attendance' || !chartReady) return null;
    return {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent'],
        datasets: [{
          data: [presentDays, absentDays || 0.0001],
          backgroundColor: [BLUE, TRACK],
          borderWidth: 0,
        }],
      },
      options: {
        cutout: '70%',
        animation: { animateRotate: true, duration: 900, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
          centerText: { mainText: `${presentDays}`, subText: `of ${totalDays} days`, color: BLUE },
        },
      },
    };
  }, [tab, chartReady, presentDays, totalDays, absentDays]);

  useChart(bmiCanvasRef, () => {
    if (tab !== 'progress' || !chartReady || bmiSeries.length === 0) return null;
    return {
      type: 'line',
      data: {
        labels: bmiSeries.map(m => m.date),
        datasets: [{
          data: bmiSeries.map(m => m.bmi),
          borderColor: BLUE,
          backgroundColor: BLUE_LIGHT + '55',
          pointBackgroundColor: BLUE,
          pointRadius: 3,
          tension: 0.35,
          fill: true,
        }],
      },
      options: {
        animation: { duration: 900, easing: 'easeOutCubic' },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 }, color: '#888' }, grid: { display: false } },
          y: { ticks: { font: { size: 9 }, color: '#888' }, grid: { color: '#eee' } },
        },
      },
    };
  }, [tab, chartReady, bmiSeries]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--card)', borderRadius: '16px 16px 0 0', padding: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -8px 30px rgba(0,0,0,.4)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{row.student.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{row.sport} · {row.batchLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--gray)', cursor: 'pointer' }}>×</button>
        </div>

        {!chartReady && (
          <div style={{ fontSize: 11, color: '#f59e0b', background: '#f59e0b1a', padding: '6px 10px', borderRadius: 6, margin: '8px 0' }}>
            Loading chart engine… if this doesn't clear, make sure the Chart.js script tag is added to index.html.
          </div>
        )}

        {/* tabs */}
        <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1, fontSize: 11 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------- POINTS ---------- */}
        {tab === 'points' && (
          <div>
            <div style={{ height: 180 }}>
              <canvas ref={pointsCanvasRef} />
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', margin: '10px 0 6px' }}>POINTS GIVEN</div>
            {pointsList.length === 0 && <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 12 }}>No points awarded yet.</div>}
            {pointsList.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span>{p.challengeName}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--gray)', fontSize: 10 }}>{(p.date || '').slice(0, 10)}</span>
                  <b style={{ color: BLUE }}>+{p.points}</b>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ---------- ATTENDANCE ---------- */}
        {tab === 'attendance' && (
          <div>
            <div style={{ height: 200 }}>
              <canvas ref={attendanceCanvasRef} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 12 }}>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BLUE, marginRight: 5 }} />Present</span>
              <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: TRACK, marginRight: 5 }} />Absent</span>
            </div>
          </div>
        )}

        {/* ---------- PROGRESS / BMI ---------- */}
        {tab === 'progress' && (
          <div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="number" placeholder="Height (cm)" className="form-input" style={{ flex: 1, fontSize: 12, padding: '8px' }}
                  value={height} onChange={e => setHeight(e.target.value)} />
                <input type="number" placeholder="Weight (kg)" className="form-input" style={{ flex: 1, fontSize: 12, padding: '8px' }}
                  value={weight} onChange={e => setWeight(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={saveMetric} disabled={saving}>
                  {saving ? '...' : 'Add'}
                </button>
              </div>
            )}

            {loadingMetrics && <div style={{ textAlign: 'center', color: 'var(--gray)', padding: 10 }}>Loading…</div>}

            {!loadingMetrics && bmiSeries.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 12 }}>No height/weight recorded yet.</div>
            )}

            {!loadingMetrics && bmiSeries.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: BLUE }}>{latest.bmi}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: latestCategory.color }}>{latestCategory.label}</div>
                </div>
                <div style={{ height: 180 }}>
                  <canvas ref={bmiCanvasRef} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
