const CHART_COLORS = {
  line: '#2f7eff',
  fill: 'rgba(47, 126, 255, 0.15)',
  grid: 'rgba(255, 255, 255, 0.06)',
  text: '#9aa2b1',
};

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function formatCurrency(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return 'Present';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderHero(profile) {
  document.getElementById('hero-title').textContent =
    profile.nickname ? `${profile.nickname} — ${profile.year} ${profile.make} ${profile.model}` : `${profile.year} ${profile.make} ${profile.model}`;
  document.getElementById('hero-subtitle').textContent = `${profile.color} · ${profile.trim}`;

  const stats = document.getElementById('hero-stats');
  const items = [
    { label: 'Current Mileage', value: profile.currentMileage.toLocaleString() + ' mi' },
    { label: 'As Of', value: formatDate(profile.mileageAsOf) },
  ];
  if (profile.vin) items.push({ label: 'VIN', value: profile.vin });

  if (profile.heroImage) document.getElementById('hero-bg').src = profile.heroImage;

  stats.innerHTML = items.map(s => `
    <div class="hero-stat">
      <div class="value">${s.value}</div>
      <div class="label">${s.label}</div>
    </div>
  `).join('');
}

function renderQuickFacts(profile, ownership, maintenance) {
  const facts = document.getElementById('quick-facts');
  const owners = ownership.length;
  const services = maintenance.length;
  const totalSpend = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

  const entries = [
    ['Make / Model', `${profile.make} ${profile.model}`],
    ['Year', profile.year],
    ['Color', profile.color],
    ['Trim', profile.trim],
    ['Owners on Record', owners],
    ['Service Entries', services],
    ['Total Spend Logged', formatCurrency(totalSpend)],
  ];

  facts.innerHTML = entries.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderOwnership(ownership) {
  const el = document.getElementById('ownership-timeline');
  if (!ownership.length) {
    el.innerHTML = '<p class="empty-state">No ownership records yet.</p>';
    return;
  }
  el.innerHTML = ownership.map(o => `
    <li>
      <div class="when">${formatDate(o.from)} – ${formatDate(o.to)}</div>
      <div class="who">${o.owner}</div>
      <div class="meta">
        ${o.mileageStart != null ? `${o.mileageStart.toLocaleString()} mi` : ''}${o.mileageEnd != null ? ` → ${o.mileageEnd.toLocaleString()} mi` : ''}
        ${o.notes ? `<br>${o.notes}` : ''}
      </div>
    </li>
  `).join('');
}

function renderMaintenance(maintenance) {
  const tbody = document.querySelector('#maintenance-table tbody');
  if (!maintenance.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No maintenance records yet.</td></tr>';
    return;
  }
  const sorted = [...maintenance].sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted.map(m => `
    <tr>
      <td>${formatDate(m.date)}</td>
      <td>${m.mileage != null ? m.mileage.toLocaleString() + ' mi' : '—'}</td>
      <td>${m.type || '—'}</td>
      <td>${m.title}${m.notes ? `<br><span style="color:var(--text-dim); font-size:0.85em;">${m.notes}</span>` : ''}</td>
      <td>${m.shop || '—'}</td>
      <td>${m.cost != null ? formatCurrency(m.cost) : '—'}</td>
      <td>${sourceBadge(m.source)}</td>
    </tr>
  `).join('');
}

function sourceBadge(source) {
  if (!source) return '—';
  const labels = { carfax: 'Carfax', owner: 'Owner', smartcar: 'Smartcar', manual: 'Manual' };
  return `<span class="badge badge-${source}">${labels[source] || source}</span>`;
}

function renderMods(mods) {
  const grid = document.getElementById('mods-grid');
  if (!mods.length) {
    grid.innerHTML = '<p class="empty-state">No modifications logged yet.</p>';
    return;
  }
  grid.innerHTML = mods.map(m => `
    <div class="card">
      <h2>${m.category || 'Mod'}</h2>
      <div class="who" style="font-size:1.05rem; font-weight:700;">${m.title}</div>
      <p class="meta" style="color:var(--text-dim); margin-top:0.4rem;">
        ${m.date ? formatDate(m.date) : ''}${m.cost != null ? ` · ${formatCurrency(m.cost)}` : ''}
      </p>
      ${m.notes ? `<p style="margin-top:0.5rem;">${m.notes}</p>` : ''}
    </div>
  `).join('');
}

function renderGallery(gallery) {
  const grid = document.getElementById('gallery-grid');
  if (!gallery.length) {
    grid.innerHTML = '<p class="empty-state">No photos yet — add image paths to data/gallery.json.</p>';
    return;
  }
  grid.innerHTML = gallery.map(g => `
    <img src="${g.src}" alt="${g.caption || ''}" loading="lazy">
  `).join('');
}

function odometerSeries(maintenance, telemetry) {
  const points = [
    ...maintenance.filter(m => m.mileage != null).map(m => ({ date: m.date, miles: m.mileage })),
    ...telemetry.filter(t => t.odometer != null).map(t => ({ date: t.date, miles: t.odometer })),
  ];
  const byDate = new Map();
  points.forEach(p => byDate.set(p.date, Math.max(byDate.get(p.date) || 0, p.miles)));
  return [...byDate.entries()]
    .map(([date, miles]) => ({ date, miles }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function renderCharts(maintenance, telemetry) {
  const sorted = odometerSeries(maintenance, telemetry);
  const labels = sorted.map(p => formatDate(p.date));
  const mileageData = sorted.map(p => p.miles);

  new Chart(document.getElementById('mileageChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Mileage',
        data: mileageData,
        borderColor: CHART_COLORS.line,
        backgroundColor: CHART_COLORS.fill,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: chartOptions('mi'),
  });

  const countByType = {};
  maintenance.forEach(m => {
    const key = m.type || 'Other';
    countByType[key] = (countByType[key] || 0) + 1;
  });

  new Chart(document.getElementById('spendChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(countByType),
      datasets: [{
        data: Object.values(countByType),
        backgroundColor: ['#2f7eff', '#1659c5', '#5aa1ff', '#0f3a82', '#8fc1ff', '#103968'],
        borderColor: '#1c1f26',
        borderWidth: 2,
      }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: CHART_COLORS.text, font: { family: "'Titillium Web', sans-serif" } } },
      },
    },
  });
}

function renderTelemetry(telemetry) {
  const el = document.getElementById('telemetry');
  const latest = [...telemetry]
    .filter(t => t.source === 'smartcar')
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  if (!latest) {
    el.innerHTML = `<p class="empty-state">No automatic readings yet. Connect the car through Smartcar and the weekly
      workflow will start appending rows to <code>data/telemetry.json</code>. See the README for setup.</p>`;
    return;
  }

  const rows = [];
  if (latest.odometer != null) rows.push(['Odometer', latest.odometer.toLocaleString() + ' mi']);
  if (latest.oilLifePct != null) rows.push(['Oil life', Math.round(latest.oilLifePct) + '%']);
  if (latest.fuelPct != null) rows.push(['Fuel', Math.round(latest.fuelPct) + '%']);
  if (latest.rangeMiles != null) rows.push(['Range', Math.round(latest.rangeMiles).toLocaleString() + ' mi']);

  const tp = latest.tirePressurePsi;
  const tires = tp ? `
    <div>
      <div class="label">Tire pressure (psi)</div>
      <div class="tire-grid">
        <span>FL ${fmtPsi(tp.frontLeft)}</span><span>FR ${fmtPsi(tp.frontRight)}</span>
        <span>RL ${fmtPsi(tp.backLeft)}</span><span>RR ${fmtPsi(tp.backRight)}</span>
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="telemetry-grid">
      ${rows.map(([k, v]) => `<div><div class="label">${k}</div><div class="value">${v}</div></div>`).join('')}
      ${tires}
    </div>
    <p class="telemetry-foot">Read ${formatDate(latest.date)} via ${sourceBadge(latest.source)}</p>`;
}

function fmtPsi(v) {
  return v == null ? '—' : v.toFixed(1);
}

async function renderRecalls(profile) {
  const el = document.getElementById('recalls');
  const q = profile.nhtsa || {};
  const make = q.make || profile.make;
  const model = q.model || profile.model;
  const completed = new Set((q.completedCampaigns || []).map(String));
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${profile.year}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NHTSA returned ${res.status}`);
    const data = await res.json();
    const recalls = data.results || [];
    if (!recalls.length) {
      el.innerHTML = `<p class="recall-summary">No recalls on file for the ${profile.year} ${profile.make} ${profile.model}.</p>`;
      return;
    }
    const open = recalls.filter(r => !completed.has(r.NHTSACampaignNumber)).length;
    el.innerHTML = `
      <p class="recall-summary">${recalls.length} campaign${recalls.length === 1 ? '' : 's'} on file,
        ${open} not yet marked complete. Mark one done by adding its campaign number to
        <code>nhtsa.completedCampaigns</code> in <code>data/profile.json</code>.</p>
      ${recalls.map(r => recallCard(r, completed.has(r.NHTSACampaignNumber))).join('')}`;
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="empty-state">Couldn't reach NHTSA (${err.message}).
      <a href="https://www.nhtsa.gov/recalls?vin=${profile.vin || ''}" target="_blank" rel="noopener">Check by VIN on nhtsa.gov &rarr;</a></p>`;
  }
}

function recallCard(r, done) {
  return `
    <div class="recall">
      <div class="recall-head">
        <strong>${r.NHTSACampaignNumber}</strong>
        <span class="badge ${done ? 'badge-done' : 'badge-open'}">${done ? 'Completed' : 'Open'}</span>
      </div>
      <div class="recall-meta">${r.Component || ''}${r.ReportReceivedDate ? ` · reported ${formatNhtsaDate(r.ReportReceivedDate)}` : ''}</div>
      <details>
        <summary>Details</summary>
        <p>${r.Summary || ''}</p>
        ${r.Consequence ? `<p><strong>Risk:</strong> ${r.Consequence}</p>` : ''}
        ${r.Remedy ? `<p><strong>Remedy:</strong> ${r.Remedy}</p>` : ''}
      </details>
    </div>`;
}

function formatNhtsaDate(s) {
  // NHTSA returns dd/mm/yyyy
  const [d, m, y] = s.split('/');
  return d && m && y ? formatDate(`${y}-${m}-${d}`) : s;
}

async function renderVinFacts(profile) {
  if (!profile.vin) return;
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${profile.vin}?format=json`);
    if (!res.ok) return;
    const v = (await res.json()).Results?.[0];
    if (!v || v.ErrorCode !== '0') return;

    const engine = [v.DisplacementL && `${v.DisplacementL}L`, v.EngineCylinders && `V${v.EngineCylinders}`, v.EngineHP && `${v.EngineHP} hp`]
      .filter(Boolean).join(' ');
    const extra = [
      ['Engine', engine],
      ['Drivetrain', v.DriveType],
      ['Transmission', v.TransmissionSpeeds ? `${v.TransmissionSpeeds}-speed ${v.TransmissionStyle || ''}`.trim() : v.TransmissionStyle],
      ['Built in', [v.PlantCity, v.PlantCountry].filter(Boolean).map(titleCase).join(', ')],
    ].filter(([, val]) => val);

    document.getElementById('quick-facts').insertAdjacentHTML('beforeend',
      extra.map(([k, val]) => `<dt>${k} <span class="source-note">VIN</span></dt><dd>${val}</dd>`).join(''));
  } catch (err) {
    console.warn('VIN decode skipped', err);
  }
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function chartOptions(unit) {
  return {
    scales: {
      x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text } },
      y: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, callback: v => v.toLocaleString() + ' ' + unit } },
    },
    plugins: { legend: { display: false } },
  };
}

function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

async function init() {
  setupTabs();
  try {
    const [profile, ownership, maintenance, mods, gallery, telemetry] = await Promise.all([
      loadJSON('data/profile.json'),
      loadJSON('data/ownership.json'),
      loadJSON('data/maintenance.json'),
      loadJSON('data/mods.json'),
      loadJSON('data/gallery.json'),
      loadJSON('data/telemetry.json'),
    ]);

    renderHero(profile);
    renderQuickFacts(profile, ownership, maintenance);
    renderOwnership(ownership);
    renderMaintenance(maintenance);
    renderMods(mods);
    renderGallery(gallery);
    renderTelemetry(telemetry);
    renderCharts(maintenance, telemetry);
    // External lookups run after the local data is on screen.
    renderRecalls(profile);
    renderVinFacts(profile);
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = `<p class="empty-state">Couldn't load car data: ${err.message}. If you're opening this file directly, run a local server (e.g. <code>python3 -m http.server</code>) since browsers block fetch() on local files.</p>`;
  }
}

init();
