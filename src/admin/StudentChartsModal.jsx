import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Uses the global `Chart` object loaded via CDN script tag in index.html:
// <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
// No npm install required.

const PRESENT_STATUS = 'P';
const BLUE = '#2563eb';
const SAPPHIRE = '#1d4ed8';
const TREND_ORANGE = '#f59e0b';
const TRACK = '#e2e8f0';

// distinct color per program bar, cycled if there are more programs than colors.
// falls back to a program's own `color` field if one is set on the record.
const PROGRAM_COLORS = ['#2563eb', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];
function colorForProgram(idx, pr) {
  return pr?.color || PROGRAM_COLORS[idx % PROGRAM_COLORS.length];
}

function bmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#f59e0b' };
  if (bmi < 25) return { label: 'Normal', color: '#22c55e' };
  if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
  return { label: 'Obese', color: '#ef4444' };
}

const TABS = [
  { key: 'points', label: '🏆 Points' },
  { key: 'attendance', label: '📆 Attendance' },
  { key: 'bmi', label: '⚖️ BMI' },
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

// draws the numeric value above each bar top / line point
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    if (!chart.config.options.plugins?.valueLabels) return;
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (ds.hideLabels) return;
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = ds.type === 'line' ? TREND_ORANGE : '#0369a1';
      ctx.textAlign = 'center';
      meta.data.forEach((el, idx) => {
        const val = ds.data[idx];
        if (val === null || val === undefined) return;
        ctx.fillText(`${val}${ds.valueSuffix || ''}`, el.x, el.y - 10);
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
  totalPoints, earnedPoints, pointsRecords, challenges, programs,
  attendanceRecords, onClose,
}) {
  const [tab, setTab] = useState('points');
  const [chartReady, setChartReady] = useState(typeof window !== 'undefined' && !!window.Chart);

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
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [pointsRecords, challengeById]);

  // entries (individual awards) vs cumulative (per-program totals)
  const [pointsView, setPointsView] = useState('entries'); // 'entries' | 'cumulative'
  const [showProgramTrend, setShowProgramTrend] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState(null); // program clicked on the bar chart
  const [expandProgram, setExpandProgram] = useState(false); // whether its challenge breakdown is open

  const switchPointsView = (view) => {
    setPointsView(view);
    setSelectedProgram(null);
    setExpandProgram(false);
  };

  // cumulative points per program — assumes each program_challenges row carries
  // a `program_id` linking it back to the programs table. If your schema names
  // that column differently, swap it below.
  const programTotals = useMemo(() => {
    const totalsByProgram = {};
    pointsRecords.forEach(p => {
      const c = challengeById[p.challenge_id];
      if (!c) return;
      const progId = c.program_id;
      if (!progId) return;
      totalsByProgram[progId] = (totalsByProgram[progId] || 0) + Number(p.points_awarded || 0);
    });
    return (programs || []).map(pr => ({
      ...pr,
      total: totalsByProgram[pr.id] || 0,
    }));
  }, [programs, challengeById, pointsRecords]);

  const challengesForSelectedProgram = useMemo(() => {
    if (!selectedProgram) return [];
    const totals = {};
    challenges
      .filter(c => c.program_id === selectedProgram.id)
      .forEach(c => { totals[c.id] = { id: c.id, name: c.name, points: 0 }; });
    pointsRecords.forEach(p => {
      if (totals[p.challenge_id]) totals[p.challenge_id].points += Number(p.points_awarded || 0);
    });
    return Object.values(totals).sort((a, b) => b.points - a.points);
  }, [selectedProgram, challenges, pointsRecords]);

  // ---------- Attendance tab data ----------
  const presentDays = attendanceRecords.filter(a => (a.status || '').toUpperCase() === PRESENT_STATUS).length;
  const totalDays = attendanceRecords.length;
  const absentDays = Math.max(0, totalDays - presentDays);

  // ---------- BMI tab data ----------
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
  const programsCanvasRef = useRef(null);
  const attendanceCanvasRef = useRef(null);
  const bmiCanvasRef = useRef(null);

  // Points tab — ENTRIES view: bar chart (points per award) + a trend line drawn over the same values
  useChart(pointsCanvasRef, () => {
    if (tab !== 'points' || pointsView !== 'entries' || !chartReady || pointsList.length === 0) return null;
    const values = pointsList.map(p => p.points);
    return {
      data: {
        labels: pointsList.map(p => p.challengeName),
        datasets: [
          {
            type: 'bar',
            label: 'Points',
            data: values,
            backgroundColor: SAPPHIRE,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 44,
            order: 2,
            hideLabels: true,
          },
          {
            type: 'line',
            label: 'Trend',
            data: values,
            borderColor: TREND_ORANGE,
            backgroundColor: TREND_ORANGE,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: TREND_ORANGE,
            tension: 0.35,
            order: 1,
          },
        ],
      },
      options: {
        animation: { duration: 900, easing: 'easeOutCubic' },
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: false }, valueLabels: true },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
          y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#64748b' } },
        },
      },
    };
  }, [tab, pointsView, chartReady, pointsList]);

  // Points tab — CUMULATIVE view: one bar per program, own color per bar, optional trend line, click-to-drill
  useChart(programsCanvasRef, () => {
    if (tab !== 'points' || pointsView !== 'cumulative' || !chartReady || programTotals.length === 0) return null;
    const values = programTotals.map(p => p.total);
    const colors = programTotals.map((p, i) => colorForProgram(i, p));
    const datasets = [
      {
        type: 'bar',
        label: 'Points',
        data: values,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 44,
        order: 2,
        hideLabels: true,
      },
    ];
    if (showProgramTrend) {
      datasets.push({
        type: 'line',
        label: 'Trend',
        data: values,
        borderColor: TREND_ORANGE,
        backgroundColor: TREND_ORANGE,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: TREND_ORANGE,
        tension: 0.35,
        order: 1,
      });
    }
    return {
      data: { labels: programTotals.map(p => p.name), datasets },
      options: {
        animation: { duration: 900, easing: 'easeOutCubic' },
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: false }, valueLabels: true },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#64748b' } },
          y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#64748b' } },
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const idx = elements[0].index;
          const pr = programTotals[idx];
          if (!pr) return;
          setSelectedProgram(pr);
          setExpandProgram(false);
        },
      },
    };
  }, [tab, pointsView, chartReady, programTotals, showProgramTrend]);

  // Attendance tab — full pie chart, present vs absent
  useChart(attendanceCanvasRef, () => {
    if (tab !== 'attendance' || !chartReady) return null;
    return {
      type: 'pie',
      data: {
        labels: ['Present', 'Absent'],
        datasets: [{ data: [presentDays, absentDays], backgroundColor: [BLUE, TRACK], borderWidth: 0 }],
      },
      options: {
        animation: { animateRotate: true, duration: 900, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 12 } } },
          tooltip: { enabled: true },
        },
      },
    };
  }, [tab, chartReady, presentDays, absentDays]);

  // BMI tab — bar chart (BMI per recorded entry) + a trend line drawn over the same values
  useChart(bmiCanvasRef, () => {
    if (tab !== 'bmi' || !chartReady || bmiSeries.length === 0) return null;
    const values = bmiSeries.map(m => m.bmi);
    return {
      data: {
        labels: bmiSeries.map(m => m.date),
        datasets: [
          {
            type: 'bar',
            label: 'BMI',
            data: values,
            backgroundColor: SAPPHIRE,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 44,
            order: 2,
            hideLabels: true,
          },
          {
            type: 'line',
            label: 'Trend',
            data: values,
            borderColor: TREND_ORANGE,
            backgroundColor: TREND_ORANGE,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: TREND_ORANGE,
            tension: 0.35,
            order: 1,
          },
        ],
      },
      options: {
        animation: { duration: 900, easing: 'easeOutCubic' },
        layout: { padding: { top: 20 } },
        plugins: { legend: { display: false }, valueLabels: true },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#64748b' } },
          y: { grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#64748b' } },
        },
      },
    };
  }, [tab, chartReady, bmiSeries]);

  return (
    // Rendered in-flow as the page content (swapped in by the parent) instead of a
    // fixed overlay — keeps a single scroll container with the rest of the app.
    <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
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

      {/* tabs — always a single row */}
      <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: '1 1 0', fontSize: 11, padding: '8px 4px', whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 16, borderRadius: 14 }}>

        {/* ---------- POINTS ---------- */}
        {tab === 'points' && (
          <div>
            {/* entries vs cumulative-by-program toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                onClick={() => switchPointsView('entries')}
                className={`btn btn-sm ${pointsView === 'entries' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, fontSize: 11, padding: '7px 4px' }}
              >
                Points Given
              </button>
              <button
                onClick={() => switchPointsView('cumulative')}
                className={`btn btn-sm ${pointsView === 'cumulative' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1, fontSize: 11, padding: '7px 4px' }}
              >
                By Program (Cumulative)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: SAPPHIRE }}>{earnedPoints}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>of {totalPoints} pts</div>
            </div>

            {/* ---------- ENTRIES sub-view ---------- */}
            {pointsView === 'entries' && (
              <>
                {pointsList.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 20 }}>No points awarded yet.</div>
                ) : (
                  <div style={{ height: 220 }}>
                    <canvas ref={pointsCanvasRef} />
                  </div>
                )}

                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray)', margin: '14px 0 6px' }}>POINTS GIVEN</div>
                {pointsList.slice().reverse().map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span>{p.challengeName}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: 'var(--gray)', fontSize: 10 }}>{(p.date || '').slice(0, 10)}</span>
                      <b style={{ color: BLUE }}>+{p.points}</b>
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* ---------- CUMULATIVE (by program) sub-view ---------- */}
            {pointsView === 'cumulative' && (
              <>
                {!programs || programs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 20 }}>No programs set up for this sport yet.</div>
                ) : (
                  <>
                    {/* trend line toggle — sits above the chart */}
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 11, color: 'var(--gray)', cursor: 'pointer', marginBottom: 6 }}>
                      <input type="checkbox" checked={showProgramTrend} onChange={e => setShowProgramTrend(e.target.checked)} />
                      Trend line
                    </label>

                    <div style={{ height: 220 }}>
                      <canvas ref={programsCanvasRef} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--gray)', textAlign: 'center', marginTop: 4 }}>Tap a bar to see that program's total</div>

                    {/* legend chips so colors are identifiable without tapping */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                      {programTotals.map((pr, i) => (
                        <span key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray)' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorForProgram(i, pr), display: 'inline-block' }} />
                          {pr.name}
                        </span>
                      ))}
                    </div>

                    {/* selected program summary — click to drill into challenges */}
                    {selectedProgram && (
                      <div style={{ marginTop: 14 }}>
                        <div
                          onClick={() => setExpandProgram(e => !e)}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 12px', borderRadius: 10, background: 'var(--card2)', cursor: 'pointer',
                            border: `1px solid ${colorForProgram(programTotals.findIndex(p => p.id === selectedProgram.id), selectedProgram)}`,
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedProgram.name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <b style={{ color: BLUE, fontSize: 13 }}>{selectedProgram.total} pts</b>
                            <span style={{ color: 'var(--gray)', fontSize: 11 }}>{expandProgram ? '▲' : '▼'}</span>
                          </span>
                        </div>

                        {expandProgram && (
                          <div style={{ marginTop: 6 }}>
                            {challengesForSelectedProgram.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', padding: 14 }}>No challenges recorded for this program yet.</div>
                            ) : challengesForSelectedProgram.map(c => (
                              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                                <span>{c.name}</span>
                                <b style={{ color: BLUE }}>{c.points} pts</b>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------- ATTENDANCE (full pie) ---------- */}
        {tab === 'attendance' && (
          <div>
            <div style={{ height: 240, maxWidth: 280, margin: '0 auto' }}>
              <canvas ref={attendanceCanvasRef} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray)', textAlign: 'center', marginTop: 8 }}>
              {presentDays} of {totalDays} days present
            </div>
          </div>
        )}

        {/* ---------- BMI (bar + trend line) ---------- */}
        {tab === 'bmi' && (
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
                <div style={{ height: 220 }}>
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
