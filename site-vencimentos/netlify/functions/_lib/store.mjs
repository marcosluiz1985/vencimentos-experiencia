import { getStore } from "@netlify/blobs";
import seed from "./seed.json" with { type: "json" };

const STORE_NAME = "vencimentos";
const KEY = "records";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

export function normName(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/\s+/g, " ");
}

function store() {
  return getStore(STORE_NAME);
}

export async function getRecords() {
  const s = store();
  let records = await s.get(KEY, { type: "json" });
  if (!records) {
    records = seed;
    await s.setJSON(KEY, records);
  }
  return records;
}

export async function saveRecords(records) {
  await store().setJSON(KEY, records);
}
