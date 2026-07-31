import { getRecords } from "./_lib/store.mjs";
import { todayISO, computeItems, sortByUrgency, fmtDate } from "./_lib/compute.mjs";

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

  const records = await getRecords();
  const today = todayISO();
  const items = sortByUrgency(computeItems(records, today)).filter((a) => !a.concluido);

  const list = items.map((a) => ({
    nome: a.nome,
    setor: a.setor,
    admissao: a.admissao ? fmtDate(a.admissao) : "-",
    etapa: a.etapa,
    etapaNum: a.etapa === "60 DIAS" ? 60 : 30,
    data: a.dateIso ? fmtDate(a.dateIso) : "-",
    status: a.status,
    delta: a.delta,
  }));

  return json({ ok: true, items: list });
};

export const config = { path: "/api/pendentes" };
