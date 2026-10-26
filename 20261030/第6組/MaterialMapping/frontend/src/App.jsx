import { useEffect, useState } from "react";
import { getMapping, getBlccByCategory, updateMapping } from "./api.js";

const KIND_LABEL = { wall: "外牆", glazing: "玻璃帷幕", interior: "內牆", window: "窗", excluded: "排除／不計入" };
const KIND_ORDER = ["wall", "glazing", "interior", "window", "excluded"];

function fmt(n) {
  return Number(n ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export default function App() {
  const [items, setItems] = useState([]);
  const [cw, setCw] = useState([]);
  const [ow, setOw] = useState([]);
  const [iw, setIw] = useState([]);
  const [w, setW] = useState([]);
  const [error, setError] = useState("");
  const [project, setProject] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());

  async function reload() {
    const data = await getMapping();
    setItems(data.items);
  }

  useEffect(() => {
    reload();
    getBlccByCategory("cw").then(setCw);
    getBlccByCategory("ow").then(setOw);
    getBlccByCategory("iw").then(setIw);
    getBlccByCategory("w").then(setW);
  }, []);

  async function handleChange(item, patch) {
    setError("");
    try {
      await updateMapping(item.elementId, item.project, patch);
      await reload();
    } catch (e) {
      setError(`更新失敗：${e.message}`);
    }
  }

  function toggleKind(kind) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const bodyOptions = (kind) => {
    if (kind === "interior") return iw;
    if (kind === "window") return w;
    return cw;
  };

  const projects = [...new Set(items.map((it) => it.project).filter(Boolean))];
  const shown = project ? items.filter((it) => it.project === project) : items;
  const total = shown.reduce((sum, it) => sum + (it.subtotal || 0), 0);

  const groups = KIND_ORDER.map((kind) => {
    const list = shown.filter((it) => it.kind === kind);
    const subtotal = list.reduce((sum, it) => sum + (it.subtotal || 0), 0);
    const guessCount = list.filter((it) => it.confidence !== "confirmed").length;
    return { kind, list, subtotal, guessCount };
  }).filter((g) => g.list.length > 0);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "24px", maxWidth: 1300, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>材料對應確認</h1>
      <p style={{ color: "#555" }}>
        依種類分類顯示。「牆本體」「外裝」用下拉選單改，改完這列的小計會立刻重算。
        面積要自己填或由 AI 從模型讀入，沒有的話小計是 0。點分類標題可以收合/展開。
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <label style={{ marginRight: 8 }}>
        專案篩選：
        <select value={project} onChange={(e) => setProject(e.target.value)} style={{ marginLeft: 6 }}>
          <option value="">全部</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <p style={{ fontWeight: "bold" }}>
        {project ? `「${project}」` : "全部"}合計：{fmt(total)} kgCO2e
      </p>

      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.kind);
        return (
          <div key={g.kind} style={{ marginBottom: 16, border: "1px solid #ddd", borderRadius: 6 }}>
            <div
              onClick={() => toggleKind(g.kind)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: "#f5f5f5", cursor: "pointer",
                borderRadius: isCollapsed ? 6 : "6px 6px 0 0",
              }}
            >
              <span style={{ fontWeight: "bold" }}>
                {isCollapsed ? "▶" : "▼"} {KIND_LABEL[g.kind]}（{g.list.length} 項）
                {g.guessCount > 0 && (
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: "normal", color: "#8a6500" }}>
                    {g.guessCount} 項待覆核
                  </span>
                )}
              </span>
              <span style={{ color: "#555" }}>
                {g.kind === "excluded" ? "不計入碳排" : `小計 ${fmt(g.subtotal)} kgCO2e`}
              </span>
            </div>

            {!isCollapsed && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#fafafa", textAlign: "left" }}>
                    <th style={th}>專案</th>
                    <th style={th}>類型</th>
                    <th style={th}>牆本體</th>
                    <th style={th}>外裝</th>
                    <th style={th}>面積 m²</th>
                    <th style={th}>單位碳排</th>
                    <th style={th}>小計</th>
                    <th style={th}>狀態</th>
                    <th style={th}>備註</th>
                  </tr>
                </thead>
                <tbody>
                  {g.list.map((it) => (
                    <tr key={`${it.project}-${it.elementId}`} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ ...td, color: "#777", fontSize: 12 }}>{it.project}</td>
                      <td style={td}>{it.typeName}</td>
                      <td style={td}>
                        {it.kind === "excluded" ? (
                          "—"
                        ) : (
                          <select value={it.bodyId ?? ""} onChange={(e) => handleChange(it, { bodyId: e.target.value })}>
                            <option value="">（未設定）</option>
                            {bodyOptions(it.kind).map((o) => (
                              <option key={o.id} value={o.id}>{o.id} {o.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={td}>
                        {it.kind === "wall" ? (
                          <select value={it.finishId ?? ""} onChange={(e) => handleChange(it, { finishId: e.target.value })}>
                            <option value="">（未設定）</option>
                            {ow.map((o) => (
                              <option key={o.id} value={o.id}>{o.id} {o.name}</option>
                            ))}
                          </select>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={td}>
                        {it.kind === "excluded" ? (
                          "—"
                        ) : (
                          <input
                            type="number"
                            value={it.areaM2}
                            style={{ width: 70 }}
                            onChange={(e) => handleChange(it, { areaM2: parseFloat(e.target.value) || 0 })}
                          />
                        )}
                      </td>
                      <td style={td}>{it.kind === "excluded" ? "—" : fmt(it.unitEC)}</td>
                      <td style={td}>{it.kind === "excluded" ? "—" : fmt(it.subtotal)}</td>
                      <td style={td}>
                        <span
                          style={{
                            padding: "2px 8px", borderRadius: 10, fontSize: 12,
                            background: it.confidence === "confirmed" ? "#d4f5dd" : "#fff3cd",
                            color: it.confidence === "confirmed" ? "#1a7a35" : "#8a6500",
                          }}
                        >
                          {it.confidence === "confirmed" ? "已確認" : "AI猜測"}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#777", fontSize: 12 }}>{it.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

const th = { padding: "8px", borderBottom: "2px solid #333" };
const td = { padding: "6px 8px", verticalAlign: "top" };
