# MaterialMapping — AI 材料辨識 + LEBR_BlccId 寫入工具

本工具是「Revit × AI 蘊含碳自動計算助手」提案裡「AI辨識材料命名」那塊的實作，
搭配組員 [LebrCarbon](../LebrCarbon/) 外掛使用，不修改、不重複其計算核心。

## 解決的問題

LebrCarbon 外掛要求使用者**手動**在牆/窗/樓板類型上填 `LEBR_BlccId` 參數，
才能被「從模型帶入」讀取。本工具用 AI（透過 Revit MCP）自動讀取模型裡的牆/窗類型，
比對官方 B-LCC 資料庫（121 筆構件係數），產生 BlccId 對照草稿，
透過網頁讓使用者確認／修改，再寫回 Revit，省掉手動查表填值的步驟。

## 整體架構

```
使用者（在對話裡跟 AI 說「有新的，幫我辨識」）
        │
        ▼
AI Agent（Claude Code + Revit MCP，本機 node server）
        │ 讀：get_wall_types / get_element_info / query_elements
        │ 寫：modify_element_parameter
        ▼
Revit 模型（牆/窗類型的 LEBR_BlccId 共用參數）
        │
        ├──→ MaterialMapping 網頁（本工具）：顯示辨識結果，下拉選單可改，即時重算小計
        │      backend: Go, :8090 ｜ frontend: React, :5180
        │      資料來源：backend/data/blcc.LEBR-2025.json（B-LCC官方資料庫副本）
        │               backend/data/mapping.json（辨識結果存檔）
        │
        └──→ LebrCarbon 外掛（組員做的，完全沒改）：「從模型帶入」讀取同一個
               LEBR_BlccId 參數 → 官方手冊公式計算 → EEC/CFR/等級 → 組員的網頁控制台
```

**兩個網站是分開的、各司其職**：MaterialMapping 管「材料對照確認」，
組員的 `console/` 管「LEBR正式結果展示與方案比較」。

## 完整工作流程（6 步）

| 步驟 | 內容 | 工具 | 狀態 |
|---|---|---|---|
| ① | 讀取模型牆/窗類型 | Revit MCP (`get_wall_types`...) | ✅ |
| ② | AI 辨識 → BlccId 草稿 | AI 人工比對 B-LCC | ✅ |
| ③ | 讀取模型實際面積 | Revit MCP (`query_elements`, `get_wall_info`) | ✅（機制已驗證，需逐專案執行） |
| ④ | 寫回 `LEBR_BlccId` 參數 | Revit MCP (`modify_element_parameter`) | ✅ |
| ⑤ | 組員外掛「從模型帶入」 | LebrCarbon（使用者在 Revit 操作） | ✅ 已驗證抓得到 |
| ⑥ | 組員外掛「計算」→ 正式 LEBR 結果 | LebrCarbon | 待使用者操作 |

## 範圍（哪些構件可以自動辨識）

**涵蓋**：牆本體（CW，6種）、外牆外裝（OW，6種）、內牆（IW，6種）、窗（W，70種組合）

**排除，且已記錄原因**：
- 主結構（樑柱）：團隊決定不做，列入研究限制
- 樓板（F/P 類別）：本次範圍未涵蓋
- 門：B-LCC 121 筆資料庫完全沒有門的對應類別（cw/ow/iw/f/p/w 六類剛好 121 筆，無第七類），已與使用者確認排除，列入研究限制
- 地下層構件（基礎、擋土牆）：非外殼評估範疇，LebrCarbon 本身也會排除地下層

## 已知限制 / 需要注意

- **B-LCC 牆本體（CW）只有 6 種標準工法**（RC現場澆置 + 5種帷幕系統），**沒有傳統磚造外牆選項**。
  模型裡的磚牆類型一律近似套用 CW-1（金屬骨架邏輯最接近），這是近似值，非精確對應。
- 目前 27 個牆類型中，約 9 個是「高信心」（名稱直接對應），其餘多數是「AI猜測」，
  **demo 前務必在 MaterialMapping 網頁上逐一檢查**，尤其是「通用-xxxmm」這幾個通用範本類型。
- 面積讀取目前是**手動觸發**（AI 被要求時才讀），不是自動同步；模型改了要主動告知 AI 重新讀取。

## 如何啟動

```powershell
.\start.ps1
# 瀏覽器開 http://localhost:5180
```

## 跟組員溝通的重點

這個工具不動 `LebrCarbon/` 任何程式碼，只負責把 `LEBR_BlccId` 這個組員外掛本來就有定義的
共用參數自動填好。對組員來說，差別只在於：原本要手動查表填的參數，現在已經被填好了，
其他操作流程（綁定參數、從模型帶入、計算）完全不變。
