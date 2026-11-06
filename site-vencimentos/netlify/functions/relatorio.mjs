import { getRecords } from "./_lib/store.mjs";
import { todayISO, fmtDate } from "./_lib/compute.mjs";

const MESES_PT = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Classifica cada funcionário a partir das decisões REAIS já registradas em
// /gerenciar.html (decisao30 / decisao60) — não é inferido por data.
function classifyRecord(r) {
  let status30 = null;
  let status60 = null;
  const tags = [];

  if (r.decisao30 === "demitido") {
    status30 = "reprovado";
    tags.push("reprovado");
  } else if (r.decisao30 === "continua") {
    status30 = "aprovado";
    tags.push("aprovado30");
    if (r.decisao60 === "efetivado") {
      status60 = "aprovado";
      tags.push("aprovado60");
    } else if (r.decisao60 === "demitido") {
      status60 = "reprovado";
      tags.push("reprovado");
    } else {
      status60 = "andamento";
      tags.push("andamento");
    }
  } else {
    status30 = "andamento";
    tags.push("andamento");
  }

  return { status30, status60, tags };
}

function statusLabel(status, etapa) {
  if (status === "aprovado") return `Aprovado ${etapa}`;
  if (status === "reprovado") return `Reprovado ${etapa}`;
  if (status === "andamento") return `Em andamento (${etapa})`;
  return "—";
}

export default async (req, context) => {
  const records = await getRecords();
  const today = todayISO();

  const rows = records.map((r) => {
    const { status30, status60, tags } = classifyRecord(r);
    let mesAno = "";
    let mesAnoLabel = "";
    if (r.contratacao) {
      const [y, m] = r.contratacao.split("-");
      mesAno = `${y}-${m}`;
      mesAnoLabel = `${MESES_PT[parseInt(m, 10)]}/${y}`;
    }
    return { ...r, status30, status60, tags, mesAno, mesAnoLabel };
  });

  const total = rows.length;
  const aprov30 = rows.filter((r) => r.status30 === "aprovado").length;
  const reprov30 = rows.filter((r) => r.status30 === "reprovado").length;
  const andamento30 = rows.filter((r) => r.status30 === "andamento").length;
  const aprov60 = rows.filter((r) => r.status60 === "aprovado").length;
  const reprov60 = rows.filter((r) => r.status60 === "reprovado").length;
  const andamento60 = rows.filter((r) => r.status60 === "andamento").length;

  const decididos30 = aprov30 + reprov30;
  const decididos60 = aprov60 + reprov60;
  const pct30 = decididos30 ? ((aprov30 / decididos30) * 100).toFixed(1) : null;
  const pct60 = decididos60 ? ((aprov60 / decididos60) * 100).toFixed(1) : null;
  const totalReprovados = reprov30 + reprov60;

  // ---- resumo numérico: efetivados x não efetivados (geral, por mês, por setor) ----
  // efetivado = decisão de 60 dias "efetivado"; não efetivado = demitido aos 30 ou 60 dias;
  // em andamento = ainda sem decisão final.
  const resultado = (r) =>
    r.status60 === "aprovado" ? "efe" : r.status30 === "reprovado" || r.status60 === "reprovado" ? "nao" : "and";
  const agrega = (keyFn, sortFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, { efe: 0, nao: 0, and: 0, key: r.mesAno || "" });
      m.get(k)[resultado(r)]++;
    }
    return Array.from(m.entries()).sort(sortFn);
  };
  const tabelaResumo = (titulo, primeira, entries) => {
    const tot = { efe: 0, nao: 0, and: 0 };
    let linhas = "";
    for (const [k, v] of entries) {
      tot.efe += v.efe; tot.nao += v.nao; tot.and += v.and;
      const dec = v.efe + v.nao;
      linhas += `<tr><td>${escapeHtml(k)}</td><td>${v.efe}</td><td>${v.nao}</td><td>${v.and}</td><td>${v.efe + v.nao + v.and}</td><td>${dec ? Math.round((v.efe / dec) * 100) + "%" : "—"}</td></tr>`;
    }
    const dec = tot.efe + tot.nao;
    linhas += `<tr class="tot"><td>TOTAL</td><td>${tot.efe}</td><td>${tot.nao}</td><td>${tot.and}</td><td>${tot.efe + tot.nao + tot.and}</td><td>${dec ? Math.round((tot.efe / dec) * 100) + "%" : "—"}</td></tr>`;
    return `<div class="box"><h2>${titulo}</h2><table class="res"><thead><tr><th>${primeira}</th><th>Efetivados</th><th>Não efetivados</th><th>Em andamento</th><th>Total</th><th>% efetivação</th></tr></thead><tbody>${linhas}</tbody></table></div>`;
  };
  const porMes = agrega((r) => r.mesAnoLabel || "Sem data", (x, y) => x[1].key.localeCompare(y[1].key));
  const porSetor = agrega((r) => r.setor || "Sem setor", (x, y) => (y[1].efe + y[1].nao + y[1].and) - (x[1].efe + x[1].nao + x[1].and) || x[0].localeCompare(y[0]));
  const totEfe = rows.filter((r) => resultado(r) === "efe").length;
  const totNao = rows.filter((r) => resultado(r) === "nao").length;
  const totAnd = rows.filter((r) => resultado(r) === "and").length;
  const resumoHtml = `
  <div class="kpis">
    <div class="kpi aprov"><div class="label">Efetivados (geral)</div><div class="value">${totEfe}</div></div>
    <div class="kpi reprov"><div class="label">Não efetivados (geral)</div><div class="value">${totNao}</div></div>
    <div class="kpi"><div class="label">Em andamento</div><div class="value">${totAnd}</div></div>
  </div>
  <div class="grid">${tabelaResumo("Por mês de contratação", "Mês", porMes)}${tabelaResumo("Por setor", "Setor", porSetor)}</div>
  <div class="note-res">% efetivação = efetivados / (efetivados + não efetivados). Baseado nas decisões registradas em Gerenciar.</div>`;

  const mesesMap = new Map();
  rows
    .slice()
    .sort((a, b) => (a.mesAno || "").localeCompare(b.mesAno || ""))
    .forEach((r) => {
      if (r.mesAno) mesesMap.set(r.mesAno, r.mesAnoLabel);
    });
  const mesesOptions = Array.from(mesesMap.entries())
    .map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`)
    .join("");

  rows.sort((a, b) => (a.contratacao || "").localeCompare(b.contratacao || "") || a.nome.localeCompare(b.nome));

  const rowsHtml = rows
    .map((r) => {
      const tagsAttr = r.tags.join(" ");
      const contratacaoStr = r.contratacao ? fmtDate(r.contratacao) : "—";
      const d30Str = r.d30 ? fmtDate(r.d30) : "—";
      const d60Str = r.d60 ? fmtDate(r.d60) : "—";
      const lbl30 = r.status30 ? statusLabel(r.status30, "30 dias") : "—";
      const lbl60 = r.status60 ? statusLabel(r.status60, "60 dias") : "—";
      return `<tr data-tags="${tagsAttr}" data-mesano="${r.mesAno}">
        <td>${escapeHtml(r.nome)}</td>
        <td>${escapeHtml(r.setor || "")}</td>
        <td>${contratacaoStr}</td>
        <td>${d30Str}</td>
        <td class="tag ${r.status30 || ""}">${lbl30}</td>
        <td>${d60Str}</td>
        <td class="tag ${r.status60 || ""}">${lbl60}</td>
      </tr>`;
    })
    .join("\n");

  const pctStr = (p) => (p === null ? "—" : `${p}%`);

  const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de Aprovação — Vencimentos de Experiência</title>
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
  .tabs { display:flex; gap:4px; margin-bottom: 18px; border-bottom: 2px solid #e2e2e2; flex-wrap: wrap; }
  .tab {
    padding: 10px 18px; font-size: 14px; text-decoration:none; color:#666;
    border-bottom: 2px solid transparent; margin-bottom: -2px;
  }
  .tab:hover { color:#222; }
  .tab.active { color:#222; font-weight:600; border-bottom-color:#2c2c2c; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { color:#666; margin-bottom: 18px; font-size: 13px; }

  .kpis { display:flex; flex-wrap:wrap; gap:12px; margin-bottom: 18px; }
  .kpi { background:#fff; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.1); padding:14px 18px; min-width:150px; flex:1; }
  .kpi .label { font-size:12px; color:#666; margin-bottom:4px; }
  .kpi .value { font-size:24px; font-weight:600; }
  .kpi.aprov .value { color:#1a7f37; }
  .kpi.reprov .value { color:#c0392b; }
  .kpi .note { font-size:11px; color:#999; margin-top:4px; }

  h2 { font-size:15px; margin:0 0 8px; }
  .grid { display:flex; flex-wrap:wrap; gap:14px; margin-bottom:18px; }
  .box { flex:1; min-width:340px; }
  table.res td, table.res th { text-align:center; }
  table.res td:first-child, table.res th:first-child { text-align:left; }
  table.res tr.tot td { font-weight:700; background:#f0f0f2; }
  .note-res { font-size:11.5px; color:#888; margin:-8px 0 18px; }
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom: 12px; }
  .filters { display:flex; gap:6px; flex-wrap:wrap; }
  .filters button {
    padding: 6px 12px; font-size: 13px; border: 1px solid #ccc; border-radius: 20px;
    background:#fff; cursor:pointer; color:#333;
  }
  .filters button.active { background:#2c2c2c; color:#fff; border-color:#2c2c2c; }
  select { padding: 7px 10px; font-size: 13px; border: 1px solid #ccc; border-radius: 6px; background:#fff; }
  #search { flex: 1; min-width: 180px; max-width: 320px; padding: 8px 12px; font-size: 14px; border: 1px solid #ccc; border-radius: 6px; background:#fff; }
  #count { font-size: 12px; color:#666; }
  .print-btn {
    margin-left:auto; padding: 8px 16px; font-size: 13px; border: none; border-radius: 6px;
    background:#2c2c2c; color:#fff; cursor:pointer;
  }

  table { border-collapse: collapse; width: 100%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13.5px; }
  th { background:#2c2c2c; color:#fff; white-space: nowrap; }
  tr.hidden { display:none; }
  td.tag.aprovado { color:#1a7f37; font-weight:600; }
  td.tag.reprovado { color:#c0392b; font-weight:600; }
  td.tag.andamento { color:#946c00; }

  .legend { margin-top: 14px; font-size: 12px; color:#555; }

  @media print {
    body { margin: 8px; background:#fff; }
    .topbar, .tabs, .toolbar, .print-btn { display:none !important; }
    .kpi { box-shadow:none; border:1px solid #ddd; }
    table { box-shadow:none; }
    @page { size: landscape; margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="topbar">
    <div>
      <div class="topbar-title">Vencimentos de Experiência</div>
      <div class="topbar-sub">Relatório de aprovação — 30/60 dias</div>
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
    <a class="tab" href="/historico.html">Histórico</a>
    <a class="tab active" href="/relatorio.html">Relatório</a>
    <a class="tab" href="/editar.html">Editar</a>
    <a class="tab" href="/upload.html">Adicionar dados</a>
  </div>

  <h1>Relatório de Aprovação — Contrato de Experiência</h1>
  <div class="sub">Gerado em ${fmtDate(today)} — baseado nas decisões registradas em Gerenciar</div>

  <div class="kpis">
    <div class="kpi"><div class="label">Total de funcionários</div><div class="value">${total}</div></div>
    <div class="kpi aprov"><div class="label">% aprovação — 30 dias</div><div class="value">${pctStr(pct30)}</div><div class="note">${aprov30} aprovados / ${reprov30} reprovados (${andamento30} em andamento)</div></div>
    <div class="kpi aprov"><div class="label">% aprovação — 60 dias</div><div class="value">${pctStr(pct60)}</div><div class="note">${aprov60} aprovados / ${reprov60} reprovados (${andamento60} em andamento)</div></div>
    <div class="kpi reprov"><div class="label">Total reprovados</div><div class="value">${totalReprovados}</div></div>
  </div>

  ${resumoHtml}

  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nome ou setor...">
    <div class="filters">
      <button class="active" data-filter="todos">Todos</button>
      <button data-filter="aprovado30">Aprovados 30 dias</button>
      <button data-filter="aprovado60">Aprovados 60 dias</button>
      <button data-filter="reprovado">Reprovados</button>
      <button data-filter="andamento">Em andamento</button>
    </div>
    <select id="mesAno">
      <option value="todos">Todos os meses</option>
      ${mesesOptions}
    </select>
    <span id="count"></span>
    <button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>

  <table id="tbl">
    <thead>
      <tr>
        <th>Nome</th>
        <th>Setor</th>
        <th>Contratação</th>
        <th>30 dias</th>
        <th>Status 30 dias</th>
        <th>60 dias</th>
        <th>Status 60 dias</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="legend">
    <span style="color:#1a7f37;font-weight:600;">Aprovado</span> &nbsp;
    <span style="color:#c0392b;font-weight:600;">Reprovado</span> &nbsp;
    <span style="color:#946c00;">Em andamento</span>
  </div>
  </div>

<script>
(function() {
  const tbody = document.querySelector('#tbl tbody');
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');
  const filterBtns = document.querySelectorAll('.filters button');
  const mesAnoSelect = document.getElementById('mesAno');

  let currentFilter = 'todos';
  let currentMesAno = 'todos';

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach(function(tr) {
      const tags = (tr.getAttribute('data-tags') || '').split(' ');
      const mesAno = tr.getAttribute('data-mesano') || '';
      const text = tr.textContent.toLowerCase();
      const matchFilter = currentFilter === 'todos' || tags.includes(currentFilter);
      const matchMes = currentMesAno === 'todos' || mesAno === currentMesAno;
      const matchSearch = q.length === 0 || text.includes(q);
      tr.classList.toggle('hidden', !(matchFilter && matchMes && matchSearch));
    });
    updateCount();
  }

  function updateCount() {
    const total = tbody.querySelectorAll('tr').length;
    const visible = tbody.querySelectorAll('tr:not(.hidden)').length;
    countEl.textContent = visible + ' de ' + total + ' registro(s)';
  }

  searchInput.addEventListener('input', applyFilters);
  mesAnoSelect.addEventListener('change', function() {
    currentMesAno = mesAnoSelect.value;
    applyFilters();
  });
  filterBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      filterBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      applyFilters();
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

export const config = { path: "/relatorio.html" };
