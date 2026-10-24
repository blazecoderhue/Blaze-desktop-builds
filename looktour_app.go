package main

// 0.19.17 look tour (frontend/dist/looktour.js): a QA screenshot run of the real app. Inert unless
// the app is started with BLAZE_LOOK_TOUR=<folder>. Then the frontend steps through every view and
// glass panel at each window size and theme; for each state Go writes <folder>/<name>.json (what the
// page measured) and <folder>/ready (the state's name), then waits until the screenshot script has
// written <folder>/<name>.png or <name>.done. Nothing is read or sent anywhere else.

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// LookTourConfig tells the frontend whether to run the tour and with which sizes and themes.
type LookTourConfig struct {
	Dir    string   `json:"dir"`
	Sizes  []string `json:"sizes"`
	Themes []string `json:"themes"`
	States []string `json:"states"`
	Quit   bool     `json:"quit"`
}

func lookTourList(env string) []string {
	var out []string
	for _, s := range strings.Split(os.Getenv(env), ",") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// LookTour is empty (Dir "") unless BLAZE_LOOK_TOUR names an existing folder.
func (a *App) LookTour() LookTourConfig {
	dir := os.Getenv("BLAZE_LOOK_TOUR")
	if dir == "" {
		return LookTourConfig{}
	}
	if st, err := os.Stat(dir); err != nil || !st.IsDir() {
		return LookTourConfig{}
	}
	return LookTourConfig{Dir: dir, Sizes: lookTourList("BLAZE_LOOK_SIZES"), Themes: lookTourList("BLAZE_LOOK_THEMES"),
		States: lookTourList("BLAZE_LOOK_STATES"), Quit: os.Getenv("BLAZE_LOOK_QUIT") == "1"}
}

var lookTourName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// LookTourStep records one state's measurements and waits (up to 30 s) for its screenshot.
func (a *App) LookTourStep(name, info string) string {
	cfg := a.LookTour()
	if cfg.Dir == "" {
		return "off"
	}
	name = lookTourName.ReplaceAllString(name, "_")
	if name == "" || len(name) > 120 {
		return "bad name"
	}
	_ = os.WriteFile(filepath.Join(cfg.Dir, name+".json"), []byte(info), 0o644)
	tmp := filepath.Join(cfg.Dir, ".ready.tmp")
	if err := os.WriteFile(tmp, []byte(name), 0o644); err != nil {
		return err.Error()
	}
	if err := os.Rename(tmp, filepath.Join(cfg.Dir, "ready")); err != nil {
		return err.Error()
	}
	if name == "finished" {
		return "ok"
	}
	for i := 0; i < 300; i++ {
		for _, f := range []string{name + ".png", name + ".done"} {
			if _, err := os.Stat(filepath.Join(cfg.Dir, f)); err == nil {
				return "ok"
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	return "timeout"
}
