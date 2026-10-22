package main

// 材料對應確認工具：顯示「Revit牆類型 -> B-LCC代碼」草稿對應表，
// 可用下拉選單改掉AI猜的結果，改了之後這面牆的碳排小計會立刻重算。
// 只管「非主結構單一構件」的碳排試算，不是正式LEBR評估（那是LebrCarbon外掛的事）。

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
)

type BlccItem struct {
	Id         string  `json:"id"`
	Category   string  `json:"category"`
	Name       string  `json:"name"`
	New        float64 `json:"new"`
	BaselineId string  `json:"baselineId"`
}

type BlccFile struct {
	Items []BlccItem `json:"items"`
}

type MappingItem struct {
	ElementId  int     `json:"elementId"`
	TypeName   string  `json:"typeName"`
	Kind       string  `json:"kind"` // wall(CW+OW) / glazing(CW only) / interior(IW) / excluded
	BodyId     *string `json:"bodyId"`
	FinishId   *string `json:"finishId"`
	AreaM2     float64 `json:"areaM2"`
	Confidence string  `json:"confidence"` // confirmed / guess
	Note       string  `json:"note"`
}

type MappingFile struct {
	UpdatedAt string        `json:"updatedAt"`
	Items     []MappingItem `json:"items"`
}

type ResolvedItem struct {
	MappingItem
	BodyName   string  `json:"bodyName"`
	FinishName string  `json:"finishName"`
	UnitEC     float64 `json:"unitEC"` // kgCO2e/m2，body+finish相加
	Subtotal   float64 `json:"subtotal"`
}

var (
	mu        sync.Mutex
	blccById  = map[string]BlccItem{}
	blccByCat = map[string][]BlccItem{}
	mapping   MappingFile
)

const (
	blccPath    = "data/blcc.LEBR-2025.json"
	mappingPath = "data/mapping.json"
)

func loadBlcc() {
	raw, err := os.ReadFile(blccPath)
	if err != nil {
		log.Fatalf("讀不到 %s: %v", blccPath, err)
	}
	var f BlccFile
	if err := json.Unmarshal(raw, &f); err != nil {
		log.Fatalf("解析 %s 失敗: %v", blccPath, err)
	}
	for _, it := range f.Items {
		blccById[it.Id] = it
		blccByCat[it.Category] = append(blccByCat[it.Category], it)
	}
	log.Printf("B-LCC 載入 %d 筆", len(f.Items))
}

func loadMapping() {
	raw, err := os.ReadFile(mappingPath)
	if err != nil {
		log.Fatalf("讀不到 %s: %v", mappingPath, err)
	}
	if err := json.Unmarshal(raw, &mapping); err != nil {
		log.Fatalf("解析 %s 失敗: %v", mappingPath, err)
	}
	log.Printf("對應表載入 %d 筆", len(mapping.Items))
}

func saveMapping() error {
	raw, err := json.MarshalIndent(mapping, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(mappingPath, raw, 0644)
}

func resolve(it MappingItem) ResolvedItem {
	r := ResolvedItem{MappingItem: it}
	if it.BodyId != nil {
		if b, ok := blccById[*it.BodyId]; ok {
			r.BodyName = b.Name
			r.UnitEC += b.New
		}
	}
	if it.FinishId != nil {
		if f, ok := blccById[*it.FinishId]; ok {
			r.FinishName = f.Name
			r.UnitEC += f.New
		}
	}
	r.Subtotal = r.UnitEC * it.AreaM2
	return r
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5180")
		w.Header().Set("Access-Control-Allow-Methods", "GET,PATCH,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// GET /api/blcc?category=cw -> 該類別的所有B-LCC選項（給下拉選單用）
func handleBlcc(w http.ResponseWriter, r *http.Request) {
	cat := r.URL.Query().Get("category")
	if cat == "" {
		json.NewEncoder(w).Encode(blccByCat)
		return
	}
	json.NewEncoder(w).Encode(blccByCat[cat])
}

// GET /api/mapping -> 全部對應表（含即時小計）
func handleMapping(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	out := make([]ResolvedItem, 0, len(mapping.Items))
	total := 0.0
	for _, it := range mapping.Items {
		ri := resolve(it)
		out = append(out, ri)
		total += ri.Subtotal
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"items": out,
		"total": total,
	})
}

// PATCH /api/mapping/{elementId}  body: {bodyId, finishId, areaM2}
func handleMappingUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "只接受 PATCH", http.StatusMethodNotAllowed)
		return
	}
	idStr := r.URL.Path[len("/api/mapping/"):]
	elementId, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "elementId 格式錯誤", http.StatusBadRequest)
		return
	}
	var body struct {
		BodyId   *string  `json:"bodyId"`
		FinishId *string  `json:"finishId"`
		AreaM2   *float64 `json:"areaM2"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "JSON 解析失敗", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	found := false
	for i := range mapping.Items {
		if mapping.Items[i].ElementId == elementId {
			if body.BodyId != nil {
				if *body.BodyId == "" {
					mapping.Items[i].BodyId = nil
				} else if _, ok := blccById[*body.BodyId]; !ok {
					http.Error(w, fmt.Sprintf("BlccId %s 不存在", *body.BodyId), http.StatusBadRequest)
					return
				} else {
					v := *body.BodyId
					mapping.Items[i].BodyId = &v
				}
			}
			if body.FinishId != nil {
				if *body.FinishId == "" {
					mapping.Items[i].FinishId = nil
				} else if _, ok := blccById[*body.FinishId]; !ok {
					http.Error(w, fmt.Sprintf("BlccId %s 不存在", *body.FinishId), http.StatusBadRequest)
					return
				} else {
					v := *body.FinishId
					mapping.Items[i].FinishId = &v
				}
			}
			if body.AreaM2 != nil {
				mapping.Items[i].AreaM2 = *body.AreaM2
			}
			mapping.Items[i].Confidence = "confirmed"
			found = true
			break
		}
	}
	if !found {
		http.Error(w, "找不到這個 elementId", http.StatusNotFound)
		return
	}
	if err := saveMapping(); err != nil {
		http.Error(w, "存檔失敗: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for _, it := range mapping.Items {
		if it.ElementId == elementId {
			json.NewEncoder(w).Encode(resolve(it))
			return
		}
	}
}

func main() {
	loadBlcc()
	loadMapping()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/blcc", withCORS(handleBlcc))
	mux.HandleFunc("/api/mapping", withCORS(handleMapping))
	mux.HandleFunc("/api/mapping/", withCORS(handleMappingUpdate))

	addr := "127.0.0.1:8090"
	fmt.Printf("Material Mapping backend listening on %s\n", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
