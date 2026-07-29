#!/usr/bin/env python3
"""
Verifica vencimentos de contrato de experiência (30 e 60 dias).
Lê controle_experiencias.xlsx, calcula quantos dias faltam para cada
vencimento e gera:
  - um resumo em texto (para colar no chat)
  - dashboard_vencimentos.html (status de todos os funcionários)

Colunas esperadas na planilha: NOME | SETOR | CONTRATAÇÃO | 30 DIAS | 60 DIAS
Uso: python3 verificar_vencimentos.py [caminho_planilha] [dias_antecedencia]
"""
import sys
import html
from datetime import datetime, date
import openpyxl

MASTER = sys.argv[1] if len(sys.argv) > 1 else "controle_experiencias.xlsx"
LEAD_DAYS = int(sys.argv[2]) if len(sys.argv) > 2 else 5
OVERDUE_GRACE = int(sys.argv[3]) if len(sys.argv) > 3 else 3  # só alerta vencidos até N dias atrás
DASHBOARD_PATH = "dashboard_vencimentos.html"


def parse_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value).strip(), "%d/%m/%Y").date()


def load_rows(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = []
    for nome, setor, contratacao, d30, d60 in ws.iter_rows(min_row=2, max_col=5, values_only=True):
        if not nome:
            continue
        rows.append({
            "nome": nome,
            "setor": setor or "",
            "contratacao": parse_date(contratacao),
            "d30": parse_date(d30),
            "d60": parse_date(d60),
        })
    return rows


def classify(dt, today):
    if dt is None:
        return None, None
    delta = (dt - today).days
    if delta < 0:
        return delta, f"VENCIDO há {-delta} dia(s)"
    if delta == 0:
        return delta, "VENCE HOJE"
    return delta, f"vence em {delta} dia(s)"


def main():
    today = date.today()
    rows = load_rows(MASTER)

    alerts = []       # dentro da antecedência configurada (ou já vencido)
    all_status = []   # todas as linhas, para o dashboard

    for r in rows:
        # Uma linha por funcionário: se já existe data de 60 dias, é porque
        # ele foi aprovado nos 30 primeiros dias — não repete o nome, mostra
        # só a etapa vigente (60 dias). Só cai em 30 dias se ainda não tiver
        # passado para a segunda etapa.
        if r["d60"] is not None:
            label, dt = "60 DIAS", r["d60"]
        elif r["d30"] is not None:
            label, dt = "30 DIAS", r["d30"]
        else:
            continue

        delta, status = classify(dt, today)
        all_status.append({
            "nome": r["nome"], "setor": r["setor"], "label": label,
            "data": dt, "delta": delta, "status": status,
        })
        if -OVERDUE_GRACE <= delta <= LEAD_DAYS:
            alerts.append({
                "nome": r["nome"], "setor": r["setor"], "label": label,
                "data": dt, "delta": delta, "status": status,
            })

    # ---- resumo em texto ----
    print(f"Verificação de vencimentos — {today.strftime('%d/%m/%Y')}")
    print(f"Antecedência configurada: {LEAD_DAYS} dias (e vencidos há até {OVERDUE_GRACE} dias)\n")
    if not alerts:
        print("Nenhum vencimento nos próximos dias.")
    else:
        alerts.sort(key=lambda a: a["delta"])
        for a in alerts:
            print(f"- {a['nome']} ({a['setor']}) — {a['label']} em "
                  f"{a['data'].strftime('%d/%m/%Y')} — {a['status']}")

    # ---- dashboard html ----
    # Ordem padrão: o que está mais PRÓXIMO de hoje primeiro (venceu ontem,
    # vence hoje, vence amanhã...), independente de já ter passado ou não.
    # Em empate de distância, o que ainda vai vencer aparece antes do que já venceu.
    all_status.sort(key=lambda a: (abs(a["delta"]), 0 if a["delta"] >= 0 else 1))

    def row_class(delta):
        if delta < 0:
            return "vencido"
        if delta <= LEAD_DAYS:
            return "urgente"
        return "ok"

    rows_html = []
    for a in all_status:
        cls = row_class(a["delta"])
        rows_html.append(
            f"<tr class='{cls}' data-delta='{a['delta']}' data-date='{a['data'].isoformat()}'>"
            f"<td>{html.escape(str(a['nome']))}</td>"
            f"<td>{html.escape(str(a['setor']))}</td>"
            f"<td>{a['label']}</td>"
            f"<td>{a['data'].strftime('%d/%m/%Y')}</td>"
            f"<td>{html.escape(a['status'])}</td>"
            f"</tr>"
        )

    dashboard = f"""<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<title>Vencimentos de Experiência</title>
<style>
  body {{ font-family: -apple-system, Arial, sans-serif; margin: 24px; background:#f7f7f8; color:#222; }}
  h1 {{ font-size: 20px; margin-bottom: 4px; }}
  .sub {{ color:#666; margin-bottom: 16px; font-size: 13px; }}
  .toolbar {{ display:flex; align-items:center; gap:10px; margin-bottom: 12px; }}
  #search {{
    flex: 1; max-width: 360px; padding: 8px 12px; font-size: 14px;
    border: 1px solid #ccc; border-radius: 6px; background:#fff;
  }}
  #count {{ font-size: 12px; color:#666; }}
  table {{ border-collapse: collapse; width: 100%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.1); }}
  th, td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }}
  th {{
    background:#2c2c2c; color:#fff; position: sticky; top:0;
    cursor: pointer; user-select: none; white-space: nowrap;
  }}
  th:hover {{ background:#3d3d3d; }}
  th .arrow {{ display:inline-block; width: 12px; opacity: 0.6; }}
  th.sorted .arrow {{ opacity: 1; }}
  tr.vencido {{ background:#fde2e2; }}
  tr.urgente {{ background:#fff3cd; }}
  tr.ok {{ background:#fff; }}
  tr.hidden {{ display:none; }}
  .legend {{ margin-top: 14px; font-size: 12px; color:#555; }}
  .legend span {{ display:inline-block; width:12px; height:12px; margin-right:4px; vertical-align:middle; }}
</style>
</head>
<body>
  <h1>Vencimentos de Contrato de Experiência</h1>
  <div class="sub">Gerado em {today.strftime('%d/%m/%Y')} — antecedência de alerta: {LEAD_DAYS} dias — ordenado do vencimento mais próximo para o mais distante</div>
  <div class="toolbar">
    <input id="search" type="text" placeholder="Buscar por nome, setor, etapa, data ou status...">
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
      {''.join(rows_html)}
    </tbody>
  </table>
  <div class="legend">
    <span style="background:#fde2e2;"></span> vencido &nbsp;
    <span style="background:#fff3cd;"></span> vence em até {LEAD_DAYS} dias &nbsp;
    <span style="background:#fff;border:1px solid #ddd;"></span> ok
  </div>

<script>
(function() {{
  const table = document.getElementById('tbl');
  const tbody = table.querySelector('tbody');
  const searchInput = document.getElementById('search');
  const countEl = document.getElementById('count');
  const headers = table.querySelectorAll('th');

  function updateCount() {{
    const total = tbody.querySelectorAll('tr').length;
    const visible = tbody.querySelectorAll('tr:not(.hidden)').length;
    countEl.textContent = visible + ' de ' + total + ' registro(s)';
  }}

  // ---- busca ----
  searchInput.addEventListener('input', function() {{
    const q = searchInput.value.trim().toLowerCase();
    tbody.querySelectorAll('tr').forEach(function(tr) {{
      const text = tr.textContent.toLowerCase();
      tr.classList.toggle('hidden', q.length > 0 && !text.includes(q));
    }});
    updateCount();
  }});

  // ---- ordenação por clique no cabeçalho ----
  let currentSort = {{ key: null, dir: 1 }};

  function cellValue(tr, colIndex, type) {{
    if (type === 'date') return tr.getAttribute('data-date') || '';
    if (type === 'delta') return parseInt(tr.getAttribute('data-delta'), 10);
    return tr.children[colIndex].textContent.trim().toLowerCase();
  }}

  headers.forEach(function(th, colIndex) {{
    th.addEventListener('click', function() {{
      const key = th.getAttribute('data-key');
      const type = th.getAttribute('data-type');
      const dir = (currentSort.key === key) ? -currentSort.dir : 1;
      currentSort = {{ key: key, dir: dir }};

      headers.forEach(function(h) {{
        h.classList.remove('sorted');
        h.querySelector('.arrow').textContent = '';
      }});
      th.classList.add('sorted');
      th.querySelector('.arrow').textContent = dir === 1 ? '▲' : '▼';

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function(a, b) {{
        const va = cellValue(a, colIndex, type);
        const vb = cellValue(b, colIndex, type);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      }});
      rows.forEach(function(tr) {{ tbody.appendChild(tr); }});
    }});
  }});

  updateCount();
}})();
</script>
</body>
</html>"""

    with open(DASHBOARD_PATH, "w", encoding="utf-8") as f:
        f.write(dashboard)


if __name__ == "__main__":
    main()
