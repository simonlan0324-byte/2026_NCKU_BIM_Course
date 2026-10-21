package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func newTestMux(t *testing.T) (*Server, *http.ServeMux) {
	t.Helper()
	db, err := OpenDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := NewServer(db)
	mux := http.NewServeMux()
	s.routes(mux)
	return s, mux
}

func do(t *testing.T, mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

// 與外掛 SnapshotBuilder 輸出同格式的最小快照
func snapshotJSON(key, name, grade string, cfr float64, schema int) string {
	b, _ := json.Marshal(map[string]any{
		"schemaVersion": schema,
		"plugin":        map[string]string{"version": "1.0.0", "manual": "LEBR-2025"},
		"project":       map[string]string{"key": key, "title": key},
		"snapshot":      map[string]string{"name": name, "createdAt": "2026-10-21T10:00:00+08:00"},
		"inputs":        map[string]any{"aFu": 336, "s": 3},
		"result":        map[string]any{"eec": 119526.0, "eecc": 145861.0, "cfr": cfr, "grade": grade},
		"items": []map[string]any{
			{"side": "design", "blccId": "CW-0", "category": "cw", "name": "傳統 15cm RC 外牆", "area": 436.08, "carbon": 32126.01},
			{"side": "baseline", "blccId": "CW-0", "category": "cw", "name": "傳統 15cm RC 外牆", "area": 436.08, "carbon": 32126.01},
		},
	})
	return string(b)
}

func TestHealth(t *testing.T) {
	_, mux := newTestMux(t)
	if rec := do(t, mux, "GET", "/api/health", ""); rec.Code != http.StatusOK {
		t.Fatalf("health = %d", rec.Code)
	}
}

func TestUploadListAndGet(t *testing.T) {
	_, mux := newTestMux(t)

	rec := do(t, mux, "POST", "/api/snapshots", snapshotJSON("專案1", "方案 A", "1級", 0.1805, 1))
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload = %d, body=%s", rec.Code, rec.Body.String())
	}
	var created struct{ ID, ProjectID int64 }
	_ = json.Unmarshal(rec.Body.Bytes(), &created)

	// 同一個 key 的第二筆快照落在同一個案子，不覆蓋第一筆
	rec = do(t, mux, "POST", "/api/snapshots", snapshotJSON("專案1", "方案 B", "2級", 0.13, 1))
	if rec.Code != http.StatusCreated {
		t.Fatalf("upload 2 = %d", rec.Code)
	}

	var projects []Project
	_ = json.Unmarshal(do(t, mux, "GET", "/api/projects", "").Body.Bytes(), &projects)
	if len(projects) != 1 || projects[0].SnapshotCount != 2 {
		t.Fatalf("projects = %+v", projects)
	}
	if projects[0].Latest == nil || projects[0].Latest.Name != "方案 B" {
		t.Fatalf("latest = %+v", projects[0].Latest)
	}

	var snaps []SnapshotSummary
	_ = json.Unmarshal(do(t, mux, "GET", "/api/projects/1/snapshots", "").Body.Bytes(), &snaps)
	if len(snaps) != 2 || snaps[0].Name != "方案 B" {
		t.Fatalf("snapshots = %+v", snaps)
	}

	rec = do(t, mux, "GET", "/api/snapshots/1", "")
	var d SnapshotDetail
	_ = json.Unmarshal(rec.Body.Bytes(), &d)
	if d.Grade != "1級" || d.Cfr != 0.1805 || d.ProjectKey != "專案1" || len(d.Items) != 2 {
		t.Fatalf("detail = %+v", d)
	}
	if !strings.Contains(string(d.Inputs), `"aFu":336`) {
		t.Fatalf("inputs not stored as-is: %s", d.Inputs)
	}

	if rec := do(t, mux, "GET", "/api/snapshots/99", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing snapshot = %d", rec.Code)
	}
}

func TestRejectsUnknownSchemaAndMissingFields(t *testing.T) {
	_, mux := newTestMux(t)

	rec := do(t, mux, "POST", "/api/snapshots", snapshotJSON("專案1", "方案 A", "1級", 0.18, 2))
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "schemaVersion") {
		t.Fatalf("schema 2 = %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(t, mux, "POST", "/api/snapshots", snapshotJSON("", "方案 A", "1級", 0.18, 1)); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty key = %d", rec.Code)
	}
	if rec := do(t, mux, "POST", "/api/snapshots", "not json"); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad json = %d", rec.Code)
	}
}

func TestSeedOnlyWhenEmpty(t *testing.T) {
	s, mux := newTestMux(t)
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "a.json"), []byte(snapshotJSON("專案1", "範例", "1級", 0.18, 1)), 0o644)

	if n, err := s.SeedIfEmpty(dir); err != nil || n != 1 {
		t.Fatalf("seed = %d, %v", n, err)
	}
	if n, _ := s.SeedIfEmpty(dir); n != 0 {
		t.Fatalf("second seed should skip, got %d", n)
	}
	var projects []Project
	_ = json.Unmarshal(do(t, mux, "GET", "/api/projects", "").Body.Bytes(), &projects)
	if len(projects) != 1 {
		t.Fatalf("projects after seed = %d", len(projects))
	}
}
