import { getRecords } from "./_lib/store.mjs";
import { todayISO, computeItems, fmtDate } from "./_lib/compute.mjs";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async (req, context) => {
  const records = await getRecords();
  const today = todayISO();
  const items = computeItems(records, today).filter((a) => a.concluido);

  // mais recentes primeiro
  items.sort((a, b) => (b.dateIso || "").localeCompare(a.dateIso || ""));

  function resultClass(status) {
    if (status === "Efetivado") return "efetivado";
    return "demitido";
  }

  const rowsHtml = items
    .map(
      (a) => `<tr class="${resultClass(a.status)}">
        <td>${escapeHtml(a.nome)}</td>
        <td>${escapeHtml(a.setor)}</td>
        <td>${a.admissao ? fmtDate(a.admissao) : "-"}</td>
        <td>${escapeHtml(a.status)}</td>
        <td>${a.dateIso ? fmtDate(a.dateIso) : "-"}</td>
      </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Histórico — Vencimentos de Experiência</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; margin: 0; background:#f7f7f8; color:#222; }
  .container { padding: 24px; }
  .topbar {
    background:#000; color:#fff; display:flex; align-items:center;
    justify-content:space-between; padding: 14px 24px; flex-wrap: wrap; gap: 12px;
  }
  .topbar-title { font-size: 18px; font-weight:600; }
  .topbar-sub { font-size: 12px; color:#aaa; margin-top: 2px; }
  .topbar-logo-wrap { display:flex; align-items:center; }
  .topbar-logo { height: 62px; width:auto; display:block; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color:#666; margin-bottom: 16px; font-size: 13px; }
  .toolbar { display:flex; align-items:center; gap:10px; margin-bottom: 12px; flex-wrap: wrap; }
  #search {
    flex: 1; max-width: 360px; padding: 8px 12px; font-size: 14px;
    border: 1px solid #ccc; border-radius: 6px; background:#fff;
  }
  #count { font-size: 12px; color:#666; }
  .tabs { display:flex; gap:4px; margin-bottom: 18px; border-bottom: 2px solid #e2e2e2; }
  .tab {
    padding: 10px 18px; font-size: 14px; text-decoration:none; color:#666;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .tab:hover { color:#222; }
  .tab.active { color:#222; font-weight:600; border-bottom-color:#2c2c2c; }
  table { border-collapse: collapse; width: 100%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background:#2c2c2c; color:#fff; position: sticky; top:0; white-space: nowrap; }
  tr.efetivado { background:#e3f6e3; }
  tr.demitido { background:#fde2e2; }
  tr.hidden { display:none; }
  .legend { margin-top: 14px; font-size: 12px; color:#555; }
  .legend span { display:inline-block; width:12px; height:12px; margin-right:4px; vertical-align:middle; }
  .empty { padding: 24px; text-align:center; color:#888; font-size: 14px; }
</style>
</head>
<body>
  <div class="topbar">
    <div>
      <div class="topbar-title">Vencimentos de Experiência</div>
      <div class="topbar-sub">Histórico — decisões já registradas</div>
    </div>
    <div class="topbar-logo-wrap">
      <img src="/logo-white.png" alt="Mavaular Móveis" class="topbar-logo">
    </div>
    <div></div>
  </div>
  <div class="container">
  <div class="tabs">
    <a class="tab" href="/">Visualizar</a>
    <a class="tab" href="/gerenciar.html">Gerenciar</a>
    <a class="tab active" href="/historico.html">Histórico</a>
    <a class="tab" href="/upload.html">Adicionar dados</a>
  </div>
  <h1>Histórico de decisões</h1>
  <div class="sub">Funcionários com decisão já registrada (efetivado ou demitido)</div>
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nome, setor ou resultado...">
    <span id="count"></span>
  </div>
  ${items.length ? `<table id="tbl">
    <thead>
      <tr>
        <th>Nome</th>
        <th>Setor</th>
        <th>Data de Admissão</th>
        <th>Resultado</th>
        <th>Data da decisão</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <div class="legend">
    <span style="background:#e3f6e3;"></span> efetivado &nbsp;
    <span style="background:#fde2e2;"></span> demitido
  </div>` : `<div class="empty">Nenhuma decisão registrada ainda.</div>`}
  </div>

<script>
(function() {
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');
  const tbody = document.querySelector('#tbl tbody');
  if (!tbody) return;

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

  updateCount();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};

export const config = { path: "/historico.html" };
