import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Uses the global `Chart` object loaded via CDN script tag in index.html:
// <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
// No npm install required.

const PRESENT_STATUS = 'P';
const BLUE = '#2563eb';
const SKY_BLUE = '#7dd3fc';
const SAPPHIRE = '#1d4ed8';
const BLUE_LIGHT = '#93c5fd';
const TRACK = '#e2e8f0';

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#f59e0b' };
  if (bmi < 25) return { label: 'Normal', color: '#22c55e' };
  if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
  return { label: 'Obese', color: '#ef4444' };
}

function weekKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const day = d.getDay();
  d.setDate(d.getDate() - day); // back to Sunday of that week
  return d.toISOString().slice(0, 10);
}

const TABS = [
  { key: 'points', label: '🏆 Points' },
  { key: 'attendance', label: '📆 Attendance' },
  { key: 'trend', label: '📈 Trend' },
  { key: 'progress', label: '⚖️ BMI' },
];

const RANGE_OPTIONS = [3, 5, 10, 'all'];

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

// draws the numeric value above each bar top / line point — used on the Trend combo chart
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    if (!chart.config.options.plugins?.valueLabels) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = ds.type === 'line' ? SAPPHIRE : '#0369a1';
      ctx.textAlign = 'center';
      meta.data.forEach((el, idx) => {
        const val = ds.data[idx];
        if (val === null || val === undefined) return;
        const label = ds.type === 'line' ? `${val}` : `${val}%`;
        ctx.fillText(label, el.x, el.y - 10);
      });
      ctx.restore();
    });
  },
};

function useChart(canvasRef, buildConfig, deps) {
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined' || !window.Chart) return;
    const Chart = window.Chart;
    if (!Chart.registry.plugins.get('centerText')) Chart.register(centerTextPlugin);
    if (!Chart.registry.plugins.get('valueLabels')) Chart.register(valueLabelsPlugin);
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
  const [trendRange, setTrendRange] = useState(3); // default: last 3 intervals

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

  // ---------- Trend tab data: weekly buckets of points earned + attendance % ----------
  const trendBuckets = useMemo(() => {
    const map = {};
    attendanceRecords.forEach(a => {
      const k = weekKey(a.date);
      if (!k) return;
      map[k] = map[k] || { key: k, present: 0, total: 0, points: 0 };
      map[k].total += 1;
      if ((a.status || '').toUpperCase() === PRESENT_STATUS) map[k].present += 1;
    });
    pointsList.forEach(p => {
      const k = weekKey(p.date);
      if (!k) return;
      map[k] = map[k] || { key: k, present: 0, total: 0, points: 0 };
      map[k].points += p.points;
    });
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(b => ({
        label: `Wk ${b.key.slice(5)}`,
        points: b.points,
        attendancePct: b.total ? Math.round((b.present / b.total) * 100) : 0,
      }));
  }, [attendanceRecords, pointsList]);

  const trendData = useMemo(() => {
    return trendRange === 'all' ? trendBuckets : trendBuckets.slice(-trendRange);
  }, [trendBuckets, trendRange]);

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
  const trendCanvasRef = useRef(null);
  const bmiCanvasRef = useRef(null);

  useChart(pointsCanvasRef, () => {
    if (tab !== 'points' || !chartReady) return null;
    return {
      type: 'doughnut',
      data: { datasets: [{ data: [pointsPct, 100 - pointsPct], backgroundColor: [BLUE, TRACK], borderWidth: 0 }] },
      options: {
        cutout: '75%', circumference: 360, rotation: -90,
        animation: { animateRotate: true, duration: 900, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false }, tooltip: { enabled: false },
          centerText: { mainText: `${earnedPoints}`, subText: `of ${totalPoints} pts`, color: BLUE },
        },
      },
    };
  }, [tab, chartReady, earnedPoints, totalPoints, pointsPct]);

  useChart(attendanceCanvasRef, () => {
    if (tab !== 'attendance' || !chartReady) return null;
    return {
      type: 'doughnut',
      data: { labels: ['Present', 'Absent'], datasets: [{ data: [presentDays, absentDays || 0.0001], backgroundColor: [BLUE, TRACK], borderWidth: 0 }] },
      options: {
        cutout: '70%',
        animation: { animateRotate: true, duration: 900, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          centerText: { mainText: `${presentDays}`, subText: `of ${totalDays} days`, color: BLUE },
        },
      },
    };
  }, [tab, chartReady, presentDays, totalDays, absentDays]);

  // Dual-axis combo chart: attendance % as rounded sky-blue bars (right axis),
  // points earned as a sapphire line with markers (left axis) — with value labels.
  useChart(trendCanvasRef, () => {
    if (tab !== 'trend' || !chartReady || trendData.length === 0) return null;
    return {
      data: {
        labels: trendData.map(d => d.label),
        datasets: [
          {
            type: 'bar',
            label: 'Attendance Rate (%)',
            data: trendData.map(d => d.attendancePct),
            backgroundColor: SKY_BLUE,
            borderRadius: 8,
            borderSkipped: false,
            yAxisID: 'y1',
            maxBarThickness: 46,
            order: 2,
          },
          {
            type: 'line',
            label: 'Points Earned',
            data: trendData.map(d => d.points),
            borderColor: SAPPHIRE,
            backgroundColor: SAPPHIRE,
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: SAPPHIRE,
            tension: 0.3,
            yAxisID: 'y',
            order: 1,
          },
        ],
      },
      options: {
        animation: { duration: 900, easing: 'easeOutCubic' },
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          valueLabels: true,
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
          y: { position: 'left', min: 0, suggestedMax: 100, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: SAPPHIRE } },
          y1: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { font: { size: 10 }, color: '#38bdf8' } },
        },
      },
    };
  }, [tab, chartReady, trendData]);

  useChart(bmiCanvasRef, () => {
    if (tab !== 'progress' || !chartReady || bmiSeries.length === 0) return null;
    return {
      type: 'line',
      data: {
        labels: bmiSeries.map(m => m.date),
        datasets: [{
          data: bmiSeries.map(m => m.bmi),
          borderColor: BLUE, backgroundColor: BLUE_LIGHT + '55',
          pointBackgroundColor: BLUE, pointRadius: 3, tension: 0.35, fill: true,
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
    // full-page overlay, same footprint as a regular page (like Performance tab) —
    // not a bottom sheet — with content centered in a max-width column
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg, #f4f6f9)', zIndex: 70, overflowY: 'auto' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--gray)', cursor: 'pointer', padding: 4 }}>←</button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{row.student.name}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{row.sport} · {row.batchLabel}</div>
          </div>
        </div>

        {!chartReady && (
          <div style={{ fontSize: 11, color: '#f59e0b', background: '#f59e0b1a', padding: '6px 10px', borderRadius: 6, marginBottom: 10 }}>
            Loading chart engine… if this doesn't clear, make sure the Chart.js script tag is added to index.html.
          </div>
        )}

        {/* tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: '1 1 auto', fontSize: 11, minWidth: 90 }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>

          {/* ---------- POINTS ---------- */}
          {tab === 'points' && (
            <div>
              <div style={{ height: 200, maxWidth: 260, margin: '0 auto' }}>
                <canvas ref={pointsCanvasRef} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', margin: '14px 0 6px' }}>POINTS GIVEN</div>
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
              <div style={{ height: 220, maxWidth: 280, margin: '0 auto' }}>
                <canvas ref={attendanceCanvasRef} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10, fontSize: 12 }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BLUE, marginRight: 5 }} />Present</span>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: TRACK, marginRight: 5 }} />Absent</span>
              </div>
            </div>
          )}

          {/* ---------- TREND (dual-axis combo) ---------- */}
          {tab === 'trend' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SAPPHIRE }}>Effort &amp; Attendance Trend</div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--card2)', padding: 3, borderRadius: 8 }}>
                  {RANGE_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setTrendRange(opt)}
                      style={{
                        border: 'none', cursor: 'pointer', padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        background: trendRange === opt ? SAPPHIRE : 'transparent',
                        color: trendRange === opt ? '#fff' : 'var(--gray)',
                      }}
                    >
                      {opt === 'all' ? 'All' : `Last ${opt}`}
                    </button>
                  ))}
                </div>
              </div>

              {trendData.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 20 }}>Not enough data yet for a trend — needs attendance or points across more than one week.</div>
              ) : (
                <div style={{ height: 260 }}>
                  <canvas ref={trendCanvasRef} />
                </div>
              )}
            </div>
          )}

          {/* ---------- PROGRESS / BMI ---------- */}
          {tab === 'progress' && (
            <div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input type="number" placeholder="Height (cm)" className="form-input" style={{ flex: 1, minWidth: 100, fontSize: 12, padding: '8px' }}
                    value={height} onChange={e => setHeight(e.target.value)} />
                  <input type="number" placeholder="Weight (kg)" className="form-input" style={{ flex: 1, minWidth: 100, fontSize: 12, padding: '8px' }}
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
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, justifyContent: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: BLUE }}>{latest.bmi}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: latestCategory.color }}>{latestCategory.label}</div>
                  </div>
                  <div style={{ height: 200 }}>
                    <canvas ref={bmiCanvasRef} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
