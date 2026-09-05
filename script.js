/* ==========================================================================
   AERIS — Air Intelligence
   Data model + interactions
   Structured so a real backend can replace AERIS.data.* without touching
   any rendering code below.
   ========================================================================== */

const AQI_CATEGORIES = [
  { key: "good", label: "GOOD", max: 50, color: "var(--aqi-good)", hex: "#4ad991" },
  { key: "moderate", label: "MODERATE", max: 100, color: "var(--aqi-moderate)", hex: "#e8c94a" },
  { key: "sensitive", label: "UNHEALTHY FOR SENSITIVE GROUPS", max: 150, color: "var(--aqi-sensitive)", hex: "#f0973d" },
  { key: "unhealthy", label: "UNHEALTHY", max: 200, color: "var(--aqi-unhealthy)", hex: "#ec5b52" },
  { key: "very-unhealthy", label: "VERY UNHEALTHY", max: 300, color: "var(--aqi-very-unhealthy)", hex: "#b169e8" },
  { key: "hazardous", label: "HAZARDOUS", max: 999, color: "var(--aqi-hazardous)", hex: "#a9695a" },
];

function classifyAQI(value) {
  return AQI_CATEGORIES.find((c) => value <= c.max) || AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

// ---- Mock environmental data model (backend-ready shape) ----------------

const AERIS = {
  region: {
    name: "Mangaluru Region",
    aqi: 82,
    pm25: 31.4,
    pm10: 57.8,
    pm25Trend: -8.2,
    pm10Trend: -3.1,
    temperature: { value: 29.4, unit: "°C", trend: 1.2, status: "Normal" },
    humidity: { value: 74, unit: "%", trend: -2.4, status: "Elevated" },
    windSpeed: { value: 11.3, unit: "km/h", trend: 4.6, status: "Normal" },
    pressure: { value: 1008.6, unit: "hPa", trend: -0.3, status: "Normal" },
    lastSync: 12,
  },
  locations: [
    { id: "plk", name: "Pilikula", aqi: 42, pm25: 14.2, pm10: 24.6, temp: 27.8, humidity: 71, updatedMin: 2 },
    { id: "kdr", name: "Kadri", aqi: 71, pm25: 24.8, pm10: 41.2, temp: 28.9, humidity: 69, updatedMin: 1 },
    { id: "hmp", name: "Hampankatta", aqi: 82, pm25: 31.4, pm10: 57.8, temp: 29.6, humidity: 75, updatedMin: 1 },
    { id: "ktr", name: "Kottara", aqi: 104, pm25: 39.6, pm10: 68.3, temp: 30.2, humidity: 77, updatedMin: 3 },
    { id: "ual", name: "Urwa", aqi: 58, pm25: 19.5, pm10: 33.1, temp: 28.1, humidity: 72, updatedMin: 4 },
    { id: "bmr", name: "Bejai", aqi: 65, pm25: 21.9, pm10: 37.4, temp: 28.6, humidity: 70, updatedMin: 2 },
  ],
  devices: [
    { id: "AQ-MNG-0114", name: "Pilikula Gate Sensor", location: "Pilikula", online: true, aqi: 42, pm25: 14.2, pm10: 24.6, updatedMin: 2, battery: 92 },
    { id: "AQ-MNG-0126", name: "Kadri Park Node", location: "Kadri", online: true, aqi: 71, pm25: 24.8, pm10: 41.2, updatedMin: 1, battery: 88 },
    { id: "AQ-MNG-0133", name: "Hampankatta Junction", location: "Hampankatta", online: true, aqi: 82, pm25: 31.4, pm10: 57.8, updatedMin: 1, battery: 76 },
    { id: "AQ-MNG-0141", name: "Kottara Circle Unit", location: "Kottara", online: true, aqi: 104, pm25: 39.6, pm10: 68.3, updatedMin: 3, battery: 64 },
    { id: "AQ-MNG-0152", name: "Urwa Roadside Node", location: "Urwa", online: true, aqi: 58, pm25: 19.5, pm10: 33.1, updatedMin: 4, battery: 81 },
    { id: "AQ-MNG-0159", name: "Bejai Substation", location: "Bejai", online: false, aqi: null, pm25: null, pm10: null, updatedMin: 47, battery: 12 },
  ],
  system: {
    devicesOnline: 23,
    devicesTotal: 24,
    gateway: "Online",
    pipeline: "Operational",
    lastSync: 12,
    coverageKm2: 68,
  },
};

// ---- Deterministic mock time-series generator ----------------------------

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateSeries(base, points, volatility, seed) {
  const rand = seededRandom(seed);
  const series = [];
  let value = base;
  for (let i = 0; i < points; i++) {
    const drift = (rand() - 0.5) * volatility;
    value = Math.max(5, value + drift);
    series.push(Math.round(value * 10) / 10);
  }
  return series;
}

const RANGE_CONFIG = {
  "24H": { points: 24, label: (i) => `${(i).toString().padStart(2, "0")}:00`, seedOffset: 0 },
  "7D": { points: 7, label: (i) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], seedOffset: 100 },
  "30D": { points: 30, label: (i) => `${i + 1}`, seedOffset: 200 },
};

function getSeriesFor(metric, range) {
  const cfg = RANGE_CONFIG[range];
  const bases = { aqi: 82, pm25: 31.4, pm10: 57.8 };
  const vol = { aqi: 14, pm25: 6, pm10: 9 };
  const seedBase = { aqi: 11, pm25: 22, pm10: 33 };
  const values = generateSeries(bases[metric], cfg.points, vol[metric], seedBase[metric] + cfg.seedOffset);
  const labels = Array.from({ length: cfg.points }, (_, i) => cfg.label(i));
  return { values, labels };
}

// ==========================================================================
// Navigation behavior
// ==========================================================================

function initNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const onScroll = () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = document.querySelector(".nav-toggle");
  const panel = document.querySelector(".nav-mobile-panel");
  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      const open = toggle.classList.toggle("is-open");
      panel.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  const clockEl = document.querySelector(".nav-clock");
  if (clockEl) {
    const updateClock = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    };
    updateClock();
    setInterval(updateClock, 1000);
  }
}

// ==========================================================================
// Semicircular AQI gauge (SVG)
// ==========================================================================

function renderGauge(container, aqi) {
  const cat = classifyAQI(aqi);
  const max = 300;
  const pct = Math.min(aqi / max, 1);

  const w = 240, h = 150;
  const cx = w / 2, cy = 130;
  const r = 96;
  const strokeW = 14;

  const startAngle = Math.PI;
  const endAngle = 0;
  const valueAngle = startAngle - pct * Math.PI;

  const polarToCartesian = (angle) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const trackStart = polarToCartesian(startAngle);
  const trackEnd = polarToCartesian(endAngle);
  const valuePoint = polarToCartesian(valueAngle);

  const largeArc = pct > 0.5 ? 1 : 0;

  const needleLen = r - strokeW / 2 - 6;
  const needleTip = {
    x: cx + needleLen * Math.cos(valueAngle),
    y: cy - needleLen * Math.sin(valueAngle),
  };

  const ticks = AQI_CATEGORIES.slice(0, 5).map((c) => c.max);
  const tickMarks = ticks
    .map((t) => {
      const a = startAngle - Math.min(t / max, 1) * Math.PI;
      const p1 = { x: cx + (r + 9) * Math.cos(a), y: cy - (r + 9) * Math.sin(a) };
      const p2 = { x: cx + (r + 2) * Math.cos(a), y: cy - (r + 2) * Math.sin(a) };
      return `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="var(--surface-border-strong)" stroke-width="2" stroke-linecap="round" />`;
    })
    .join("");

  const svg = `
    <svg viewBox="0 0 ${w} ${h}" fill="none">
      <path d="M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}"
        stroke="var(--surface-3)" stroke-width="${strokeW}" stroke-linecap="round" />
      ${tickMarks}
      <path d="M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 ${largeArc} 1 ${valuePoint.x} ${valuePoint.y}"
        stroke="${cat.hex}" stroke-width="${strokeW}" stroke-linecap="round" />
      <circle cx="${cx}" cy="${cy}" r="5" fill="var(--text-secondary)" />
      <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(1)}" y2="${needleTip.y.toFixed(1)}"
        stroke="var(--text-primary)" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
  container.innerHTML = svg;
}

// ==========================================================================
// Lightweight canvas line chart (no external dependency)
// ==========================================================================

function drawLineChart(canvas, series, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const W = rect.width, H = rect.height;
  const padL = 34, padR = 8, padT = 12, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  const allValues = series.flatMap((s) => s.values);
  const min = Math.min(...allValues) * 0.9;
  const max = Math.max(...allValues) * 1.1;

  const rootStyles = getComputedStyle(document.documentElement);
  const gridColor = "rgba(148, 178, 209, 0.08)";
  const textColor = rootStyles.getPropertyValue("--text-faint").trim() || "#4c5b6d";

  // gridlines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = "10px JetBrains Mono, monospace";
  ctx.fillStyle = textColor;
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    const val = max - ((max - min) / gridLines) * i;
    ctx.fillText(Math.round(val).toString(), 2, y + 3);
  }

  const labels = series[0].labels;
  const n = labels.length;
  const labelStep = Math.max(1, Math.floor(n / 6));
  ctx.textAlign = "center";
  labels.forEach((lab, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return;
    const x = padL + (plotW / (n - 1)) * i;
    ctx.fillText(lab, x, H - 6);
  });
  ctx.textAlign = "left";

  series.forEach((s) => {
    const pts = s.values.map((v, i) => ({
      x: padL + (plotW / (s.values.length - 1)) * i,
      y: padT + plotH - ((v - min) / (max - min)) * plotH,
    }));

    // area fill
    if (s.fill) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, s.fillColor || "rgba(53, 214, 229, 0.18)");
      grad.addColorStop(1, "rgba(53, 214, 229, 0)");
      ctx.beginPath();
      ctx.moveTo(pts[0].x, padT + plotH);
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = s.color || "#35d6e5";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // last point marker
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = s.color || "#35d6e5";
    ctx.fill();
  });
}

function initCharts() {
  const chartBlocks = document.querySelectorAll("[data-chart]");
  chartBlocks.forEach((block) => {
    const metric = block.dataset.chart;
    const canvas = block.querySelector("canvas");
    const buttons = block.querySelectorAll(".range-btn");

    const render = (range) => {
      const { values, labels } = getSeriesFor(metric, range);
      const color = metric === "aqi" ? "#35d6e5" : metric === "pm25" ? "#35d6e5" : "#7fb8e0";
      drawLineChart(canvas, [{ values, labels, color, fill: true }]);
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        render(btn.dataset.range);
      });
    });

    render("24H");
    window.addEventListener("resize", () => {
      const activeBtn = block.querySelector(".range-btn.is-active");
      render(activeBtn ? activeBtn.dataset.range : "24H");
    });
  });
}

function drawSparkline(canvas, values, color) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const min = Math.min(...values), max = Math.max(...values);
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (W / (values.length - 1)) * i;
    const y = H - ((v - min) / (max - min || 1)) * (H - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function initSparklines() {
  document.querySelectorAll("[data-spark]").forEach((canvas) => {
    const seed = parseInt(canvas.dataset.sparkSeed || "1", 10);
    const base = parseFloat(canvas.dataset.sparkBase || "50");
    const vol = parseFloat(canvas.dataset.sparkVol || "3");
    const values = generateSeries(base, 16, vol, seed);
    drawSparkline(canvas, values, "#35d6e5");
  });
}

// ==========================================================================
// Expandable location list (locations.html)
// ==========================================================================

function initExpandables() {
  document.querySelectorAll(".expand-item").forEach((item) => {
    const head = item.querySelector(".expand-head");
    const body = item.querySelector(".expand-body");
    head.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      if (isOpen) {
        body.style.maxHeight = "0px";
        item.classList.remove("is-open");
      } else {
        item.classList.add("is-open");
        body.style.maxHeight = body.scrollHeight + "px";
      }
    });
  });
}

// ==========================================================================
// Init
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  if (window.__aerisInitGauge !== false) {
    const gaugeEl = document.querySelector("[data-gauge]");
    if (gaugeEl) renderGauge(gaugeEl, AERIS.region.aqi);
  }
  initCharts();
  initSparklines();
  initExpandables();
});
