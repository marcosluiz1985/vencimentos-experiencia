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
  a.btn {
    padding: 8px 14px; background:#2c2c2c; color:#fff; border-radius:6px;
    text-decoration:none; font-size:13px; white-space:nowrap;
  }
  a.btn:hover { background:#3d3d3d; }
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
</style>
</head>
<body>
  <h1>Vencimentos de Contrato de Experiência</h1>
  <div class="sub">Atualizado em ${fmtDate(today)} — ordenado do vencimento mais próximo para o mais distante</div>
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nome, setor, etapa, data ou status...">
    <span id="count"></span>
    <a class="btn" href="/upload.html">+ Adicionar novos dados</a>
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

<script>
(function() {
  const table = document.getElementById('tbl');
  const tbody = table.querySelector('tbody');
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');
  const headers = table.querySelectorAll('th');

  function updateCount() {
    const total = tbody.querySelectorAll('tr').length;
    const visible = tbody.querySelectorAll('tr:not(.hidden)').length;
    countEl.textContent = visible + ' de ' + total + ' registro(s)';
  }

  searchInput.addEventListener('input', function() {
    const q = searchInput.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach(function(tr) {
      const text = tr.textContent.toLowerCase();
      tr.classList.toggle('hidden', q.length > 0 && !text.includes(q));
    });
    updateCount();
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

  updateCount();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const config = { path: "/" };
