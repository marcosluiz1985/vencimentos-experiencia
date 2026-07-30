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
  const existingNames = new Set(records.map((r) => normName(r.nome)));

  let added = 0;
  let dup = 0;
  const addedNames = [];
  for (const rec of extracted) {
    const key = normName(rec.nome);
    if (!key || existingNames.has(key)) {
      dup++;
      continue;
    }
    records.push(rec);
    existingNames.add(key);
    added++;
    addedNames.push(rec.nome);
  }

  if (added > 0) {
    await saveRecords(records);
  }

  return json({
    ok: true,
    file: filename,
    totalNoArquivo: extracted.length,
    adicionados: added,
    duplicados: dup,
    nomesAdicionados: addedNames,
  });
};

export const config = { path: "/api/upload" };
