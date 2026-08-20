// Lista os registros de quem ainda está em experiência (exclui quem já foi
// efetivado ou demitido) com as datas em formato ISO cru, pra alimentar a
// página de edição manual.
import { getRecords } from "./_lib/store.mjs";
import { todayISO, computeItems } from "./_lib/compute.mjs";

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
  const concluidos = new Set(
    computeItems(records, today)
      .filter((a) => a.concluido)
      .map((a) => a.nome)
  );
  const emExperiencia = records.filter((r) => !concluidos.has(r.nome));

  const list = emExperiencia
    .map((r) => ({
      nome: r.nome,
      setor: r.setor || "",
      contratacao: r.contratacao || "",
      d30: r.d30 || "",
      d60: r.d60 || "",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return json({ ok: true, items: list });
};

export const config = { path: "/api/registros" };
