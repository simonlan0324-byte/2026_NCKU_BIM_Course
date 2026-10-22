const BASE = "http://localhost:8090";

export async function getMapping() {
  const r = await fetch(`${BASE}/api/mapping`);
  return r.json();
}

export async function getBlccByCategory(category) {
  const r = await fetch(`${BASE}/api/blcc?category=${category}`);
  return r.json();
}

export async function updateMapping(elementId, patch) {
  const r = await fetch(`${BASE}/api/mapping/${elementId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
