import { getRecords, saveRecords, normName } from "./_lib/store.mjs";
import { extractRecords } from "./_lib/extract.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  let form;
  try {
    form = await req.formData();
  } catch (e) {
    return json({ error: "Não foi possível ler o envio (formato inválido)" }, 400);
  }

  const password = form.get("password");
  const expected = Netlify.env.get("UPLOAD_PASSWORD") || "190460";
  if (!expected || password !== expected) {
    return json({ error: "Senha incorreta" }, 401);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return json({ error: "Nenhum arquivo enviado" }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || "arquivo";

  let extracted;
  try {
    extracted = await extractRecords(buffer, filename);
  } catch (e) {
    return json({ error: `Erro ao ler "${filename}": ${e.message}` }, 400);
  }

  if (!extracted.length) {
    return json({
      error: `Não consegui reconhecer nenhum funcionário em "${filename}". Confira se o arquivo tem colunas de nome, setor e data de contratação.`,
    }, 400);
  }

  const records = await getRecords();
  const byName = new Map(records.map((r) => [normName(r.nome), r]));

  let added = 0;
  let updated = 0;
  let dup = 0;
  const addedNames = [];
  const updatedNames = [];
  for (const rec of extracted) {
    const key = normName(rec.nome);
    if (!key) {
      dup++;
      continue;
    }
    const existing = byName.get(key);
    if (!existing) {
      records.push(rec);
      byName.set(key, rec);
      added++;
      addedNames.push(rec.nome);
      continue;
    }
    // já existe um registro com esse nome. Se o cadastrado ficou sem data de
    // 30/60 dias (ex.: de uma importação anterior que não reconheceu as
    // colunas do arquivo) e o novo arquivo traz essas datas, completa o
    // registro em vez de simplesmente ignorar como duplicado.
    const existingHasDates = Boolean(existing.d30 || existing.d60);
    const newHasDates = Boolean(rec.d30 || rec.d60);
    if (!existingHasDates && newHasDates) {
      existing.setor = existing.setor || rec.setor;
      existing.contratacao = existing.contratacao || rec.contratacao;
      existing.d30 = rec.d30 || existing.d30;
      existing.d60 = rec.d60 || existing.d60;
      updated++;
      updatedNames.push(rec.nome);
    } else {
      dup++;
    }
  }

  if (added > 0 || updated > 0) {
    await saveRecords(records);
  }

  return json({
    ok: true,
    file: filename,
    totalNoArquivo: extracted.length,
    adicionados: added,
    atualizados: updated,
    duplicados: dup,
    nomesAdicionados: addedNames,
    nomesAtualizados: updatedNames,
  });
};

export const config = { path: "/api/upload" };
