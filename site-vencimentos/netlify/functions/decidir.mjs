import { getRecords, saveRecords, normName } from "./_lib/store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

  const nome = form.get("nome");
  const etapa = form.get("etapa");
  const decisao = form.get("decisao");

  if (!nome) return json({ error: "Nome não informado" }, 400);

  if (etapa === "30" && !["continua", "demitido"].includes(decisao)) {
    return json({ error: "Decisão inválida para a etapa de 30 dias" }, 400);
  }
  if (etapa === "60" && !["efetivado", "demitido"].includes(decisao)) {
    return json({ error: "Decisão inválida para a etapa de 60 dias" }, 400);
  }
  if (etapa !== "30" && etapa !== "60") {
    return json({ error: "Etapa inválida (use 30 ou 60)" }, 400);
  }

  const records = await getRecords();
  const key = normName(nome);
  const record = records.find((r) => normName(r.nome) === key);
  if (!record) {
    return json({ error: `Funcionário "${nome}" não encontrado` }, 404);
  }

  const today = todayISO();
  if (etapa === "30") {
    record.decisao30 = decisao;
    record.decisao30Data = today;
  } else {
    record.decisao60 = decisao;
    record.decisao60Data = today;
  }

  await saveRecords(records);

  return json({ ok: true, nome: record.nome, etapa, decisao });
};

export const config = { path: "/api/decidir" };
