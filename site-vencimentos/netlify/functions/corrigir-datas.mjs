import { getRecords, saveRecords, normName } from "./_lib/store.mjs";

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
    return json({ error: "Não foi possível ler o envio" }, 400);
  }

  const password = form.get("password");
  const expected = Netlify.env.get("UPLOAD_PASSWORD") || "190460";
  if (!expected || password !== expected) {
    return json({ error: "Senha incorreta" }, 401);
  }

  const nome = form.get("nome");
  if (!nome) return json({ error: "Nome não informado" }, 400);

  const records = await getRecords();
  const key = normName(nome);
  const record = records.find((r) => normName(r.nome) === key);
  if (!record) {
    return json({ error: `Funcionário "${nome}" não encontrado` }, 404);
  }

  const contratacao = form.get("contratacao");
  const d30 = form.get("d30");
  const d60 = form.get("d60");
  if (contratacao) record.contratacao = contratacao;
  if (d30) record.d30 = d30;
  if (d60) record.d60 = d60;

  await saveRecords(records);
  return json({ ok: true, record });
};

export const config = { path: "/api/corrigir-datas" };
