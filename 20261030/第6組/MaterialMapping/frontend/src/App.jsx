import { useEffect, useState } from "react";
import { getMapping, getBlccByCategory, updateMapping } from "./api.js";

const KIND_LABEL = { wall: "外牆", glazing: "玻璃帷幕", interior: "內牆", window: "窗", excluded: "排除" };

function fmt(n) {
  return Number(n ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

export default function App() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [cw, setCw] = useState([]);
  const [ow, setOw] = useState([]);
  const [iw, setIw] = useState([]);
  const [w, setW] = useState([]);
  const [error, setError] = useState("");

  async function reload() {
    const data = await getMapping();
    setItems(data.items);
    setTotal(data.total);
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
      await updateMapping(item.elementId, patch);
      await reload();
    } catch (e) {
      setError(`更新失敗：${e.message}`);
    }
  }

  const bodyOptions = (kind) => {
    if (kind === "interior") return iw;
    if (kind === "window") return w;
    return cw;
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22 }}>材料對應確認</h1>
      <p style={{ color: "#555" }}>
        每列是一個 Revit 牆類型。「牆本體」「外裝」用下拉選單改，改完這列的小計會立刻重算。
        面積要自己填（m²），沒填的話小計是 0，只有「單位碳排」是有意義的參考值。
      </p>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p style={{ fontWeight: "bold" }}>目前合計：{fmt(total)} kgCO2e</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
            <th style={th}>類型</th>
            <th style={th}>種類</th>
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
          {items.map((it) => (
            <tr key={it.elementId} style={{ borderBottom: "1px solid #ddd", opacity: it.kind === "excluded" ? 0.5 : 1 }}>
              <td style={td}>{it.typeName}</td>
              <td style={td}>{KIND_LABEL[it.kind]}</td>
              <td style={td}>
                {it.kind === "excluded" ? (
                  "—"
                ) : (
                  <select
                    value={it.bodyId ?? ""}
                    onChange={(e) => handleChange(it, { bodyId: e.target.value })}
                  >
                    <option value="">（未設定）</option>
                    {bodyOptions(it.kind).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td style={td}>
                {it.kind === "wall" ? (
                  <select
                    value={it.finishId ?? ""}
                    onChange={(e) => handleChange(it, { finishId: e.target.value })}
                  >
                    <option value="">（未設定）</option>
                    {ow.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} {o.name}
                      </option>
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
                    padding: "2px 8px",
                    borderRadius: 10,
                    fontSize: 12,
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
    </div>
  );
}

const th = { padding: "8px", borderBottom: "2px solid #333" };
const td = { padding: "6px 8px", verticalAlign: "top" };
