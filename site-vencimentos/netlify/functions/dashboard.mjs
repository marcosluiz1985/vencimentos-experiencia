import { getRecords } from "./_lib/store.mjs";

const LEAD_DAYS = 5;
const OVERDUE_GRACE = 3;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(isoDate, todayIso) {
  const a = new Date(isoDate + "T00:00:00Z");
  const b = new Date(todayIso + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}

function classify(delta) {
  if (delta < 0) return `VENCIDO há ${-delta} dia(s)`;
  if (delta === 0) return "VENCE HOJE";
  return `vence em ${delta} dia(s)`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async (req, context) => {
  const records = await getRecords();
  const today = todayISO();

  const items = [];
  for (const r of records) {
    let label, dateIso;
    if (r.d60) {
      label = "60 DIAS";
      dateIso = r.d60;
    } else if (r.d30) {
      label = "30 DIAS";
      dateIso = r.d30;
    } else {
      continue;
    }
    const delta = diffDays(dateIso, today);
    items.push({
      nome: r.nome,
      setor: r.setor || "",
      label,
      dateIso,
      delta,
      status: classify(delta),
    });
  }

  // mais próximos de hoje primeiro; empate: o que ainda vai vencer antes do que já venceu
  items.sort((a, b) => {
    const da = Math.abs(a.delta);
    const db = Math.abs(b.delta);
    if (da !== db) return da - db;
    const sa = a.delta >= 0 ? 0 : 1;
    const sb = b.delta >= 0 ? 0 : 1;
    return sa - sb;
  });

  function rowClass(delta) {
    if (delta < 0) return "vencido";
    if (delta <= LEAD_DAYS) return "urgente";
    return "ok";
  }

  const rowsHtml = items
    .map(
      (a) => `<tr class="${rowClass(a.delta)}" data-delta="${a.delta}" data-date="${a.dateIso}">
        <td>${escapeHtml(a.nome)}</td>
        <td>${escapeHtml(a.setor)}</td>
        <td>${a.label}</td>
        <td>${fmtDate(a.dateIso)}</td>
        <td>${escapeHtml(a.status)}</td>
      </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vencimentos de Experiência</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; margin: 24px; background:#f7f7f8; color:#222; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color:#666; margin-bottom: 16px; font-size: 13px; }
  .toolbar { display:flex; align-items:center; gap:10px; margin-bottom: 12px; flex-wrap: wrap; }
  #search {
    flex: 1; max-width: 360px; padding: 8px 12px; font-size: 14px;
    border: 1px solid #ccc; border-radius: 6px; background:#fff;
  }
  #count { font-size: 12px; color:#666; }
  #toggleOverdue {
    padding: 8px 14px; background:#fff; color:#333; border:1px solid #ccc;
    border-radius: 6px; font-size: 13px; cursor:pointer; white-space:nowrap;
  }
  #toggleOverdue:hover { background:#f0f0f0; }
  #toggleOverdue.active { background:#2c2c2c; color:#fff; border-color:#2c2c2c; }
  .tabs { display:flex; gap:4px; margin-bottom: 18px; border-bottom: 2px solid #e2e2e2; }
  .tab {
    padding: 10px 18px; font-size: 14px; text-decoration:none; color:#666;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .tab:hover { color:#222; }
  .tab.active { color:#222; font-weight:600; border-bottom-color:#2c2c2c; }
  table { border-collapse: collapse; width: 100%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
  th {
    background:#2c2c2c; color:#fff; position: sticky; top:0;
    cursor: pointer; user-select: none; white-space: nowrap;
  }
  th:hover { background:#3d3d3d; }
  th .arrow { display:inline-block; width: 12px; opacity: 0.6; }
  th.sorted .arrow { opacity: 1; }
  tr.vencido { background:#fde2e2; }
  tr.urgente { background:#fff3cd; }
  tr.ok { background:#fff; }
  tr.hidden { display:none; }
  .legend { margin-top: 14px; font-size: 12px; color:#555; }
  .legend span { display:inline-block; width:12px; height:12px; margin-right:4px; vertical-align:middle; }
  #alertBanner {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
    max-width: 560px; width: calc(100% - 40px); background:#2c2c2c; color:#fff;
    border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.25);
    padding: 16px 18px; display:none; z-index: 1000;
  }
  #alertBanner.show { display:block; }
  #alertBanner .row { display:flex; align-items:flex-start; gap:10px; margin-bottom: 8px; }
  #alertBanner .row:last-of-type { margin-bottom: 0; }
  #alertBanner .icon { font-size: 16px; line-height: 1.4; }
  #alertBanner .txt { font-size: 13px; line-height: 1.4; }
  #alertBanner .txt b { font-weight:600; }
  #alertBanner .close {
    position:absolute; top:8px; right:10px; background:none; border:none; color:#aaa;
    font-size: 16px; cursor:pointer; line-height:1;
  }
  #alertBanner .close:hover { color:#fff; }
</style>
</head>
<body>
  <div class="tabs">
    <a class="tab active" href="/">Visualizar</a>
    <a class="tab" href="/upload.html">Adicionar dados</a>
  </div>
  <h1>Vencimentos de Contrato de Experiência</h1>
  <div class="sub">Atualizado em ${fmtDate(today)} — ordenado do vencimento mais próximo para o mais distante</div>
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nome, setor, etapa, data ou status...">
    <button id="toggleOverdue" type="button">Mostrar vencidos</button>
    <span id="count"></span>
  </div>
  <table id="tbl">
    <thead>
      <tr>
        <th data-key="nome" data-type="text">Nome <span class="arrow"></span></th>
        <th data-key="setor" data-type="text">Setor <span class="arrow"></span></th>
        <th data-key="label" data-type="text">Etapa <span class="arrow"></span></th>
        <th data-key="date" data-type="date">Data <span class="arrow"></span></th>
        <th data-key="delta" data-type="delta">Status <span class="arrow"></span></th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="legend">
    <span style="background:#fde2e2;"></span> vencido &nbsp;
    <span style="background:#fff3cd;"></span> vence em até ${LEAD_DAYS} dias &nbsp;
    <span style="background:#fff;border:1px solid #ddd;"></span> ok
  </div>

  <div id="alertBanner">
    <button class="close" type="button" aria-label="Fechar">&times;</button>
    <div id="alertContent"></div>
  </div>

<script>
(function() {
  const table = document.getElementById('tbl');
  const tbody = table.querySelector('tbody');
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');
  const toggleBtn = document.getElementById('toggleOverdue');
  const headers = table.querySelectorAll('th');

  let hideOverdue = true;

  function overdueCount() {
    return tbody.querySelectorAll('tr.vencido').length;
  }

  function updateToggleLabel() {
    const n = overdueCount();
    toggleBtn.textContent = hideOverdue ? 'Mostrar vencidos (' + n + ')' : 'Ocultar vencidos (' + n + ')';
    toggleBtn.classList.toggle('active', !hideOverdue);
  }

  function updateCount() {
    const total = tbody.querySelectorAll('tr').length;
    const visible = tbody.querySelectorAll('tr:not(.hidden)').length;
    countEl.textContent = visible + ' de ' + total + ' registro(s)';
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach(function(tr) {
      if (q.length > 0) {
        // durante uma busca, mostra tudo que combinar, mesmo os vencidos ocultos
        const text = tr.textContent.toLowerCase();
        tr.classList.toggle('hidden', !text.includes(q));
      } else {
        tr.classList.toggle('hidden', hideOverdue && tr.classList.contains('vencido'));
      }
    });
    updateCount();
  }

  searchInput.addEventListener('input', applyFilters);

  toggleBtn.addEventListener('click', function() {
    hideOverdue = !hideOverdue;
    updateToggleLabel();
    applyFilters();
  });

  let currentSort = { key: null, dir: 1 };

  function cellValue(tr, colIndex, type) {
    if (type === 'date') return tr.getAttribute('data-date') || '';
    if (type === 'delta') return parseInt(tr.getAttribute('data-delta'), 10);
    return tr.children[colIndex].textContent.trim().toLowerCase();
  }

  headers.forEach(function(th, colIndex) {
    th.addEventListener('click', function() {
      const key = th.getAttribute('data-key');
      const type = th.getAttribute('data-type');
      const dir = (currentSort.key === key) ? -currentSort.dir : 1;
      currentSort = { key: key, dir: dir };

      headers.forEach(function(h) {
        h.classList.remove('sorted');
        h.querySelector('.arrow').textContent = '';
      });
      th.classList.add('sorted');
      th.querySelector('.arrow').textContent = dir === 1 ? '▲' : '▼';

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a, b) {
        const va = cellValue(a, colIndex, type);
        const vb = cellValue(b, colIndex, type);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
      rows.forEach(function(tr) { tbody.appendChild(tr); });
    });
  });

  updateToggleLabel();
  applyFilters();

  // ---- balão de aviso (hoje / faltam 5 dias) ----
  const banner = document.getElementById('alertBanner');
  const bannerContent = document.getElementById('alertContent');
  const bannerClose = banner.querySelector('.close');

  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const nomeOf = function(tr) { return tr.children[0].textContent.trim(); };
  const setorOf = function(tr) { return tr.children[1].textContent.trim(); };

  const hojeRows = allRows.filter(function(tr) { return parseInt(tr.getAttribute('data-delta'), 10) === 0; });
  const cincoDiasRows = allRows.filter(function(tr) { return parseInt(tr.getAttribute('data-delta'), 10) === 5; });

  function listNames(rows) {
    return rows.map(function(tr) { return nomeOf(tr) + ' (' + setorOf(tr) + ')'; }).join(', ');
  }

  let bannerHtml = '';
  if (hojeRows.length) {
    bannerHtml += '<div class="row"><span class="icon">⚠️</span><span class="txt"><b>Vence hoje (' + hojeRows.length + '):</b> ' + listNames(hojeRows) + '</span></div>';
  }
  if (cincoDiasRows.length) {
    bannerHtml += '<div class="row"><span class="icon">⏳</span><span class="txt"><b>Faltam 5 dias (' + cincoDiasRows.length + '):</b> ' + listNames(cincoDiasRows) + '</span></div>';
  }

  const STORAGE_KEY = 'vencimentos_banner_dismissed_' + '${today}';
  if (bannerHtml && !sessionStorage.getItem(STORAGE_KEY)) {
    bannerContent.innerHTML = bannerHtml;
    banner.classList.add('show');
  }

  bannerClose.addEventListener('click', function() {
    banner.classList.remove('show');
    sessionStorage.setItem(STORAGE_KEY, '1');
  });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const config = { path: "/" };
