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
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No maintenance records yet.</td></tr>';
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
    </tr>
  `).join('');
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

function renderCharts(maintenance, profile) {
  const sorted = [...maintenance]
    .filter(m => m.mileage != null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = sorted.map(m => formatDate(m.date));
  const mileageData = sorted.map(m => m.mileage);

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
    const [profile, ownership, maintenance, mods, gallery] = await Promise.all([
      loadJSON('data/profile.json'),
      loadJSON('data/ownership.json'),
      loadJSON('data/maintenance.json'),
      loadJSON('data/mods.json'),
      loadJSON('data/gallery.json'),
    ]);

    renderHero(profile);
    renderQuickFacts(profile, ownership, maintenance);
    renderOwnership(ownership);
    renderMaintenance(maintenance);
    renderMods(mods);
    renderGallery(gallery);
    renderCharts(maintenance, profile);
  } catch (err) {
    console.error(err);
    document.querySelector('main').innerHTML = `<p class="empty-state">Couldn't load car data: ${err.message}. If you're opening this file directly, run a local server (e.g. <code>python3 -m http.server</code>) since browsers block fetch() on local files.</p>`;
  }
}

init();
