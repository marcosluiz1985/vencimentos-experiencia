// Lógica compartilhada para calcular o "estado atual" de cada funcionário
// (30 dias / 60 dias / concluído) a partir dos registros brutos. Usada pelo
// dashboard, pela página de gerenciar decisões e pelo histórico.

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function diffDays(isoDate, todayIso) {
  const a = new Date(isoDate + "T00:00:00Z");
  const b = new Date(todayIso + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}

export function classify(delta) {
  if (delta < 0) return `VENCIDO há ${-delta} dia(s)`;
  if (delta === 0) return "VENCE HOJE";
  return `vence em ${delta} dia(s)`;
}

export function fmtDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function addDays(iso, days) {
  if (!iso) return null;
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Alguns registros mais antigos (da planilha original) nunca tiveram a data de
// 60 dias calculada, porque na época o funcionário ainda nem tinha passado
// dos 30 dias. Se precisarmos mostrar a etapa de 60 dias e ela não existir,
// calculamos a partir da admissão (ou da data de 30 dias) em vez de deixar a
// pessoa "presa" na etapa de 30 dias mesmo depois de decidido que continua.
function resolveD60(r) {
  if (r.d60) return r.d60;
  if (r.contratacao) return addDays(r.contratacao, 60);
  if (r.d30) return addDays(r.d30, 30);
  return null;
}

// Retorna, para cada registro, o estado atual: concluído (com o resultado) ou
// pendente (etapa 30 ou 60, com a data de referência e quantos dias faltam).
export function computeItems(records, todayIso) {
  const items = [];
  for (const r of records) {
    const concluido = r.decisao30 === "demitido" || Boolean(r.decisao60);

    let etapa, dateIso, statusText;
    if (concluido) {
      if (r.decisao30 === "demitido") {
        etapa = "ENCERRADO";
        dateIso = r.decisao30Data || r.d30;
        statusText = "Demitido nos 30 dias";
      } else if (r.decisao60 === "efetivado") {
        etapa = "EFETIVADO";
        dateIso = r.decisao60Data || resolveD60(r);
        statusText = "Efetivado";
      } else {
        etapa = "ENCERRADO";
        dateIso = r.decisao60Data || resolveD60(r);
        statusText = "Demitido nos 60 dias";
      }
    } else if (r.decisao30 === "continua") {
      // já decidido que continua: mostra a etapa de 60 dias mesmo que essa
      // data nunca tenha sido calculada no registro original.
      const d60 = resolveD60(r);
      if (d60) {
        etapa = "60 DIAS";
        dateIso = d60;
      } else {
        continue;
      }
    } else if (r.d30 && diffDays(r.d30, todayIso) >= 0) {
      etapa = "30 DIAS";
      dateIso = r.d30;
    } else if (r.d60) {
      etapa = "60 DIAS";
      dateIso = r.d60;
    } else if (r.d30) {
      etapa = "30 DIAS";
      dateIso = r.d30;
    } else {
      continue;
    }

    const delta = dateIso ? diffDays(dateIso, todayIso) : null;
    items.push({
      record: r,
      nome: r.nome,
      setor: r.setor || "",
      admissao: r.contratacao || "",
      etapa,
      dateIso,
      delta,
      status: statusText || classify(delta),
      concluido,
    });
  }
  return items;
}

export function sortByUrgency(items) {
  return [...items].sort((a, b) => {
    const da = Math.abs(a.delta ?? 0);
    const db = Math.abs(b.delta ?? 0);
    if (da !== db) return da - db;
    const sa = (a.delta ?? 0) >= 0 ? 0 : 1;
    const sb = (b.delta ?? 0) >= 0 ? 0 : 1;
    return sa - sb;
  });
}
