// Extrai registros de funcionários (nome, setor, contratação) de arquivos
// Excel/CSV, Word (.docx) ou PDF, identificando colunas por palavra-chave
// para funcionar mesmo com cabeçalhos diferentes da planilha mestre.

import * as XLSX from "xlsx";

function stripAccents(s) {
  return String(s)
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

function normText(s) {
  if (s === null || s === undefined) return "";
  return stripAccents(String(s).trim().toLowerCase());
}

function guessColumn(headerCell) {
  const h = normText(headerCell);
  if (!h) return null;
  if (h.includes("nome")) return "nome";
  if (h.includes("setor")) return "setor";
  if (h.includes("contrat") || h.includes("admiss")) return "contratacao";
  if (h.includes("30") && h.includes("dia")) return "d30";
  if (h.includes("60") && h.includes("dia")) return "d60";
  return null;
}

function parseDateFlex(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !isNaN(value)) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;

  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (com ano de 2 ou 4 dígitos)
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    let year = parseInt(y, 10);
    if (y.length === 2) year += 2000;
    const iso = `${year.toString().padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const dt = new Date(iso + "T00:00:00Z");
    if (!isNaN(dt)) return iso;
  }
  // yyyy-mm-dd
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function addDays(iso, days) {
  if (!iso) return null;
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// rows: array de arrays (linha 0 = cabeçalho, se reconhecido)
function tableToRecords(rows) {
  if (!rows || !rows.length) return [];

  // acha a linha de cabeçalho: primeira linha que tenha uma célula reconhecida como "nome"
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((c) => guessColumn(c) === "nome")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const header = rows[headerIdx];
  const colMap = {};
  header.forEach((cell, i) => {
    const key = guessColumn(cell);
    if (key) colMap[i] = key;
  });
  if (!Object.values(colMap).includes("nome")) return [];

  const records = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const rec = {};
    for (const [i, key] of Object.entries(colMap)) {
      const val = row[i];
      if (key === "contratacao" || key === "d30" || key === "d60") {
        rec[key] = parseDateFlex(val);
      } else {
        rec[key] = val !== null && val !== undefined ? String(val).trim() : "";
      }
    }
    if (rec.nome) records.push(rec);
  }
  return records;
}

function finalizeRecords(records) {
  return records
    .filter((r) => r.nome)
    .map((r) => {
      const contratacao = r.contratacao || null;
      const d30 = r.d30 || (contratacao ? addDays(contratacao, 30) : null);
      const d60 = r.d60 || (contratacao ? addDays(contratacao, 60) : null);
      return {
        nome: r.nome,
        setor: r.setor || "",
        contratacao,
        d30,
        d60,
      };
    });
}

function extractFromSpreadsheet(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  return tableToRecords(rows);
}

async function extractFromDocx(buffer) {
  const mammoth = (await import("mammoth")).default;
  const cheerio = await import("cheerio");
  const { value: htmlContent } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(htmlContent);
  let records = [];
  $("table").each((_, table) => {
    const rows = [];
    $(table)
      .find("tr")
      .each((__, tr) => {
        const cells = [];
        $(tr)
          .find("td,th")
          .each((___, td) => {
            cells.push($(td).text());
          });
        rows.push(cells);
      });
    records = records.concat(tableToRecords(rows));
  });
  return records;
}

const Y_TOLERANCE = 2; // px de diferença de altura para considerar "mesma linha"

async function extractFromPdf(buffer) {
  // pdfjs-dist referencia DOMMatrix no escopo do módulo (usado internamente
  // para transformações de página) mesmo sem renderizar nada visualmente.
  // Node não tem DOMMatrix nativo, então usamos um polyfill antes de importar.
  if (typeof globalThis.DOMMatrix === "undefined") {
    globalThis.DOMMatrix = (await import("dommatrix")).default;
  }
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const rows = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = content.items
      .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5], width: it.width || 0 }))
      .filter((it) => it.text.trim() !== "");

    // agrupa itens em linhas por coordenada Y (topo da página para baixo)
    const lines = [];
    for (const it of items) {
      let line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOLERANCE);
      if (!line) {
        line = { y: it.y, items: [] };
        lines.push(line);
      }
      line.items.push(it);
    }
    lines.sort((a, b) => b.y - a.y);
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));

    // as colunas de uma tabela ficam em posições X fixas independente do
    // conteúdo; usamos a linha do cabeçalho (a que tem uma célula "nome")
    // como referência de onde cada coluna começa, e depois encaixamos as
    // demais linhas nessas mesmas posições. Isso é mais confiável do que
    // medir o espaço entre palavras, que varia com o tamanho do texto.
    let headerLine = lines.find((l) => l.items.some((it) => guessColumn(it.text) === "nome"));
    if (!headerLine) headerLine = lines[0];
    const colAnchors = headerLine ? headerLine.items.map((it) => it.x) : [];

    function bucketize(line) {
      if (!colAnchors.length) return line.items.map((it) => it.text);
      const cols = new Array(colAnchors.length).fill("");
      for (const it of line.items) {
        // maior âncora que é <= x do item (com folga de alguns px)
        let idx = 0;
        for (let i = 0; i < colAnchors.length; i++) {
          if (it.x + 3 >= colAnchors[i]) idx = i;
        }
        cols[idx] = cols[idx] ? cols[idx] + " " + it.text : it.text;
      }
      return cols;
    }

    for (const line of lines) {
      rows.push(bucketize(line));
    }
  }

  return tableToRecords(rows);
}

export async function extractRecords(buffer, filename) {
  const name = (filename || "").toLowerCase();
  let raw = [];
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv") || name.endsWith(".xlsm")) {
    raw = extractFromSpreadsheet(buffer);
  } else if (name.endsWith(".docx")) {
    raw = await extractFromDocx(buffer);
  } else if (name.endsWith(".pdf")) {
    raw = await extractFromPdf(buffer);
  } else {
    throw new Error("Formato de arquivo não suportado (use .xlsx, .xls, .csv, .docx ou .pdf)");
  }
  return finalizeRecords(raw);
}
