// 所有 fetch 集中在這裡（與 RFI 範例相同），頁面元件不直接寫網址。
// 後端位址：Vite proxy 下用相對路徑即可；直連後端時改這裡。
export const API_BASE = ''

async function get(path) {
  const r = await fetch(`${API_BASE}${path}`)
  if (!r.ok) {
    let msg = await r.text()
    try { msg = JSON.parse(msg).error ?? msg } catch { /* 不是 JSON 就用原文 */ }
    throw new Error(msg)
  }
  return r.json()
}

export async function health() {
  try {
    const r = await fetch(`${API_BASE}/api/health`)
    return r.ok
  } catch {
    return false
  }
}

export const listProjects = () => get('/api/projects')
export const listSnapshots = (projectId) => get(`/api/projects/${projectId}/snapshots`)
export const getSnapshot = (id) => get(`/api/snapshots/${id}`)
export const compareSnapshots = (ids) => get(`/api/compare?ids=${ids.join(',')}`)
// Excel 計算書直接用連結下載，不經 fetch
export const excelUrl = (id) => `${API_BASE}/api/snapshots/${id}/excel`
