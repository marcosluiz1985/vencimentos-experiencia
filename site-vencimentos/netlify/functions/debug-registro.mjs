import { getRecords, normName } from "./_lib/store.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async (req, context) => {
  const url = new URL(req.url);
  const password = url.searchParams.get("password");
  const expected = Netlify.env.get("UPLOAD_PASSWORD") || "190460";
  if (!expected || password !== expected) {
    return json({ error: "Senha incorreta" }, 401);
  }

  const nomeQuery = url.searchParams.get("nome");
  const records = await getRecords();

  if (!nomeQuery) {
    return json({ total: records.length, nomes: records.map((r) => r.nome) });
  }

  const key = normName(nomeQuery);
  const matches = records.filter((r) => normName(r.nome) === key);
  return json({ query: nomeQuery, matches: matches.length, records: matches });
};

export const config = { path: "/api/debug-registro" };
