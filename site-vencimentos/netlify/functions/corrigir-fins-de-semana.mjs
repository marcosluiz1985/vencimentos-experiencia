// Correção em lote (uma vez só): qualquer d30/d60 já salvo que caia em
// sábado ou domingo é antecipado para a sexta-feira anterior. Só mexe em
// datas calculadas automaticamente que ficaram erradas — não em decisões
// já registradas (decisao30Data/decisao60Data).
import { getRecords, saveRecords } from "./_lib/store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function toPreviousFridayIfWeekend(iso) {
  if (!iso) return iso;
  const dt = new Date(iso + "T00:00:00Z");
  const dow = dt.getUTCDay(); // 0 = domingo, 6 = sábado
  if (dow === 6) dt.setUTCDate(dt.getUTCDate() - 1);
  else if (dow === 0) dt.setUTCDate(dt.getUTCDate() - 2);
  return dt.toISOString().slice(0, 10);
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
  const changes = [];

  for (const r of records) {
    for (const campo of ["d30", "d60"]) {
      const original = r[campo];
      if (!original) continue;
      const corrigida = toPreviousFridayIfWeekend(original);
      if (corrigida !== original) {
        changes.push({ nome: r.nome, campo, de: original, para: corrigida });
        r[campo] = corrigida;
      }
    }
  }

  if (changes.length) {
    await saveRecords(records);
  }

  return json({ ok: true, totalCorrigido: changes.length, changes });
};

export const config = { path: "/api/corrigir-fins-de-semana" };
