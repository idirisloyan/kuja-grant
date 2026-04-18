/**
 * Kuja Studio chart wrappers around Chart.js.
 *
 * Chart.js is loaded via <script> in index.html (window.Chart). These
 * wrappers give it consistent Kuja-Studio styling + a paired
 * AI-narrated insight caption.
 */

const PALETTE = {
  clay:    '#C2410C',
  clayLt:  '#FED7AA',
  sand:    '#F4E8DC',
  savanna: '#4A6741',
  savannaLt:'#DCEBD9',
  ink:     '#0F172A',
  inkSoft: '#475569',
  line:    '#E2E8F0',
  grow:    '#15803D',
  sun:     '#D97706',
  flag:    '#B91C1C',
  spark:   '#7C3AED',
};

const FONT_FAMILY = 'Inter, system-ui, sans-serif';

const _baseOptions = () => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { font: { family: FONT_FAMILY, size: 11 }, color: PALETTE.inkSoft, usePointStyle: true, pointStyle: 'circle', padding: 12 },
    },
    tooltip: {
      backgroundColor: 'white',
      titleColor: PALETTE.ink,
      bodyColor: PALETTE.inkSoft,
      borderColor: PALETTE.line,
      borderWidth: 1,
      padding: 10,
      cornerRadius: 8,
      titleFont: { family: FONT_FAMILY, weight: '600', size: 12 },
      bodyFont: { family: FONT_FAMILY, size: 12 },
      displayColors: true,
      boxPadding: 6,
    },
  },
});

/**
 * Render a chart of the given type into `canvas`.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} type — 'pipeline-funnel' | 'risk-heatmap' | 'compliance-trend'
 *                       | 'review-velocity' | 'sla-breakdown' | 'deadline-timeline'
 *                       | 'readiness-ring' | 'conversion-funnel' | 'activity-heatmap'
 *                       | 'pie' | 'bar' | 'line'
 * @param {Object} data — chart-specific data
 * @returns {Chart} chart instance
 */
export function renderChart(canvas, type, data) {
  if (!canvas || !window.Chart) return null;
  const ctx = canvas.getContext('2d');
  const opts = _baseOptions();

  switch (type) {
    case 'pipeline-funnel': return _funnel(ctx, data, opts);
    case 'risk-heatmap':    return _heatmap(ctx, data, opts);
    case 'compliance-trend':return _stackedBars(ctx, data, opts);
    case 'review-velocity': return _velocity(ctx, data, opts);
    case 'sla-breakdown':   return _slaBreakdown(ctx, data, opts);
    case 'readiness-ring':  return _readinessRing(ctx, data, opts);
    case 'conversion-funnel':return _conversionFunnel(ctx, data, opts);
    case 'pie':             return _pie(ctx, data, opts);
    case 'bar':             return _bar(ctx, data, opts);
    case 'line':            return _line(ctx, data, opts);
    default:                return _bar(ctx, data, opts);
  }
}

// ===== chart implementations =====

function _funnel(ctx, data, opts) {
  // data: { labels: ['Submitted', 'Reviewed', 'Shortlisted', 'Awarded'], values: [n, n, n, n] }
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Applications',
        data: data.values,
        backgroundColor: [PALETTE.clayLt, PALETTE.clay, PALETTE.savanna, PALETTE.grow],
        borderRadius: 6,
        barPercentage: 0.6,
      }],
    },
    options: {
      ...opts,
      indexAxis: 'y',
      plugins: { ...opts.plugins, legend: { display: false } },
      scales: {
        x: { grid: { color: PALETTE.line, drawTicks: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true },
        y: { grid: { display: false }, ticks: { color: PALETTE.ink, font: { family: FONT_FAMILY, size: 12, weight: '500' } } },
      },
    },
  });
}

function _heatmap(ctx, data, opts) {
  // data: { rows: [{label, scores: [{dim, value, severity}]}] }
  // Render as grouped bar where each row is a row in the matrix
  const dims = data.rows[0]?.scores.map((s) => s.dim) ?? [];
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.rows.map((r) => r.label),
      datasets: dims.map((dim, i) => ({
        label: dim,
        data: data.rows.map((r) => r.scores[i]?.value ?? 0),
        backgroundColor: [PALETTE.savanna, PALETTE.sun, PALETTE.flag, PALETTE.spark][i % 4],
        borderRadius: 4,
      })),
    },
    options: {
      ...opts,
      scales: {
        x: { stacked: false, grid: { display: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } } },
        y: { stacked: false, grid: { color: PALETTE.line }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true, max: 100 },
      },
    },
  });
}

function _stackedBars(ctx, data, opts) {
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: data.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: [PALETTE.flag, PALETTE.sun, PALETTE.savanna][i] ?? PALETTE.line,
        borderRadius: 3,
      })),
    },
    options: {
      ...opts,
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } } },
        y: { stacked: true, grid: { color: PALETTE.line }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true },
      },
    },
  });
}

function _velocity(ctx, data, opts) {
  // data: { stages: [{name, median, p75, count}] }
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.stages.map((s) => s.name),
      datasets: [
        { label: 'Median (days)', data: data.stages.map((s) => s.median), backgroundColor: PALETTE.savanna, borderRadius: 4 },
        { label: 'p75 (days)',    data: data.stages.map((s) => s.p75),    backgroundColor: PALETTE.sun,     borderRadius: 4 },
      ],
    },
    options: {
      ...opts,
      scales: {
        x: { grid: { display: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } } },
        y: { grid: { color: PALETTE.line }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true },
      },
    },
  });
}

function _slaBreakdown(ctx, data, opts) {
  // data: { buckets: ['<3d', '3-7d', '7-14d', '14d+'], counts: [..] }
  return new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.buckets,
      datasets: [{
        data: data.counts,
        backgroundColor: [PALETTE.grow, PALETTE.savanna, PALETTE.sun, PALETTE.flag],
        borderWidth: 2,
        borderColor: 'white',
      }],
    },
    options: { ...opts, cutout: '65%' },
  });
}

function _readinessRing(ctx, data, opts) {
  // data: { score: 0-100, breakdown: [{name, value}] }
  // Show a gauge using doughnut with the score in center
  const remainder = Math.max(0, 100 - data.score);
  return new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Ready', 'To improve'],
      datasets: [{
        data: [data.score, remainder],
        backgroundColor: [
          data.score >= 70 ? PALETTE.grow : data.score >= 50 ? PALETTE.sun : PALETTE.flag,
          PALETTE.line,
        ],
        borderWidth: 0,
        circumference: 270,
        rotation: 225,
      }],
    },
    options: {
      ...opts,
      cutout: '70%',
      plugins: { ...opts.plugins, legend: { display: false }, tooltip: { enabled: false } },
    },
  });
}

function _conversionFunnel(ctx, data, opts) {
  // labels: opportunities → applications → shortlists → awards
  return _funnel(ctx, data, opts);
}

function _pie(ctx, data, opts) {
  return new window.Chart(ctx, {
    type: 'pie',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        backgroundColor: [PALETTE.clay, PALETTE.savanna, PALETTE.sun, PALETTE.spark, PALETTE.grow, PALETTE.flag],
        borderWidth: 2,
        borderColor: 'white',
      }],
    },
    options: opts,
  });
}

function _bar(ctx, data, opts) {
  return new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: (data.datasets ?? [{ label: 'Series', data: data.values }]).map((d, i) => ({
        ...d,
        backgroundColor: d.backgroundColor ?? [PALETTE.clay, PALETTE.savanna, PALETTE.sun, PALETTE.spark][i % 4],
        borderRadius: 4,
      })),
    },
    options: {
      ...opts,
      scales: {
        x: { grid: { display: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } } },
        y: { grid: { color: PALETTE.line }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true },
      },
    },
  });
}

function _line(ctx, data, opts) {
  return new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: (data.datasets ?? [{ label: 'Series', data: data.values }]).map((d, i) => ({
        ...d,
        borderColor: d.borderColor ?? [PALETTE.clay, PALETTE.savanna, PALETTE.spark][i % 3],
        backgroundColor: d.backgroundColor ?? [PALETTE.clayLt, PALETTE.savannaLt, '#DDD6FE'][i % 3],
        tension: 0.35,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: 'white',
        pointBorderWidth: 2,
        borderWidth: 2.5,
      })),
    },
    options: {
      ...opts,
      scales: {
        x: { grid: { display: false }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } } },
        y: { grid: { color: PALETTE.line }, ticks: { color: PALETTE.inkSoft, font: { family: FONT_FAMILY, size: 11 } }, beginAtZero: true },
      },
    },
  });
}

/**
 * Fetch an AI-narrated caption for a chart and inject it.
 * Calls /api/ai/insight-narrate. On failure shows a quiet skip message.
 */
export async function renderInsightCaption(captionEl, { chartType, data, context = '' }) {
  if (!captionEl) return;
  try {
    const res = await fetch('/api/ai/insight-narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chart_type: chartType, data, context }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.ok && json.data?.caption) {
      captionEl.classList.remove('kuja-chart-caption-loading');
      captionEl.innerHTML = `
        <div class="kuja-ai-mark mb-1"><i data-lucide="sparkles" class="w-3 h-3"></i> AI insight</div>
        <div>${escapeHtml(json.data.caption)}</div>
      `;
      if (window.lucide?.createIcons) window.lucide.createIcons();
    } else {
      captionEl.style.display = 'none';
    }
  } catch (e) {
    captionEl.style.display = 'none';
  }
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
