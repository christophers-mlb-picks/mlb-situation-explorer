/* MLB TeamRankings Situation Explorer */
(function () {
  "use strict";

  const CAT_LABEL = { win: "Win%", ats: "Cover%", ou: "Over%" };
  const CAT_KEY = { win: "win", ats: "ats", ou: "ou" };

  const state = {
    data: null,
    category: "win",
    situations: new Set(),
    minN: 20,
    minPct: 0,
    vsBaseline: false,
    minWinStreak: 0,
    minLoseStreak: 0,
    includeW: true,
    includeL: true,
    minL10Wins: 0,
    maxL10Wins: 10,
    search: "",
    tab: "heat",
    scatterMode: "situations", // situations | win_cover
    scatterX: "is_home_dog",
    scatterY: "is_away_dog",
    scatterSit: "is_home_dog",
    sortCol: "pct",
    sortDir: -1,
    pinned: null,
    todayOnly: false,
    yearLo: 2021,
    yearHi: 2026,
    rdSurplusDog: false,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function loadStateFromHash() {
    try {
      const h = location.hash.replace(/^#/, "");
      if (!h) return;
      const o = JSON.parse(decodeURIComponent(h));
      if (o.category) state.category = o.category;
      if (Array.isArray(o.situations)) state.situations = new Set(o.situations);
      if (typeof o.minN === "number") state.minN = o.minN;
      if (typeof o.minPct === "number") state.minPct = o.minPct;
      if (typeof o.vsBaseline === "boolean") state.vsBaseline = o.vsBaseline;
      if (typeof o.minWinStreak === "number") state.minWinStreak = o.minWinStreak;
      if (typeof o.minLoseStreak === "number") state.minLoseStreak = o.minLoseStreak;
      if (typeof o.includeW === "boolean") state.includeW = o.includeW;
      if (typeof o.includeL === "boolean") state.includeL = o.includeL;
      if (typeof o.minL10Wins === "number") state.minL10Wins = o.minL10Wins;
      if (typeof o.maxL10Wins === "number") state.maxL10Wins = o.maxL10Wins;
      if (o.tab) state.tab = o.tab;
      if (o.scatterX) state.scatterX = o.scatterX;
      if (o.scatterY) state.scatterY = o.scatterY;
      if (o.scatterSit) state.scatterSit = o.scatterSit;
      if (o.scatterMode) state.scatterMode = o.scatterMode;
      if (typeof o.todayOnly === "boolean") state.todayOnly = o.todayOnly;
      if (typeof o.rdSurplusDog === "boolean") state.rdSurplusDog = o.rdSurplusDog;
      if (typeof o.yearLo === "number") state.yearLo = o.yearLo;
      if (typeof o.yearHi === "number") state.yearHi = o.yearHi;
      if (o.baselineWindow && typeof o.yearLo !== "number") {
        const m = String(o.baselineWindow).match(/^(\d{4})-(\d{4})$/);
        if (m) { state.yearLo = +m[1]; state.yearHi = +m[2]; }
      }
    } catch (_) {}
  }

  function saveState() {
    const o = {
      category: state.category,
      situations: [...state.situations],
      minN: state.minN,
      minPct: state.minPct,
      vsBaseline: state.vsBaseline,
      minWinStreak: state.minWinStreak,
      minLoseStreak: state.minLoseStreak,
      includeW: state.includeW,
      includeL: state.includeL,
      minL10Wins: state.minL10Wins,
      maxL10Wins: state.maxL10Wins,
      tab: state.tab,
      scatterX: state.scatterX,
      scatterY: state.scatterY,
      scatterSit: state.scatterSit,
      scatterMode: state.scatterMode,
      todayOnly: state.todayOnly,
      rdSurplusDog: state.rdSurplusDog,
      yearLo: state.yearLo,
      yearHi: state.yearHi,
    };
    try {
      localStorage.setItem("mlb-tr-explorer", JSON.stringify(o));
      history.replaceState(null, "", "#" + encodeURIComponent(JSON.stringify(o)));
    } catch (_) {}
  }

  function yearRange() {
    const pack = state.data.baseline_years || {};
    let lo = state.yearLo;
    let hi = state.yearHi;
    const minY = pack.min || 2007;
    const maxY = pack.max || 2026;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    lo = Math.max(minY, Math.min(maxY, lo || minY));
    hi = Math.max(minY, Math.min(maxY, hi || maxY));
    return { lo, hi, minY, maxY };
  }

  function pooledBaseline(sc, cat) {
    const pack = state.data.baseline_years;
    const series = pack?.by_sc?.[sc]?.[cat];
    if (!series) {
      const b = state.data.baselines?.[sc]?.[cat];
      return b && typeof b.pct === "number" ? { pct: b.pct, n: b.n || 0 } : null;
    }
    const { lo, hi } = yearRange();
    let n = 0;
    let w = 0;
    for (let y = lo; y <= hi; y++) {
      const c = series[String(y)] || series[y];
      if (!c || !c.n) continue;
      n += c.n;
      w += c.pct * c.n;
    }
    if (!n) return null;
    return { pct: +((w / n).toFixed(3)), n };
  }

  function baseline(sc, cat) {
    const b = pooledBaseline(sc, cat);
    return b ? b.pct : null;
  }

  function baselineMeta(sc, cat) {
    return pooledBaseline(sc, cat);
  }

  function updateYearSpanLabel() {
    const el = $("#year-span");
    if (!el) return;
    const { lo, hi } = yearRange();
    const seasons = hi - lo + 1;
    el.textContent = `Baseline ${lo}–${hi} · ${seasons} season${seasons === 1 ? "" : "s"}. Edge = this year’s situation % minus that pooled rate.`;
  }

  function cell(abbr, sc, cat) {
    return state.data.matrix?.[abbr]?.[sc]?.[cat] || null;
  }

  function metricValue(c, sc) {
    if (!c || c.pct == null) return null;
    if (!state.vsBaseline) return c.pct;
    const b = baseline(sc, state.category);
    if (b == null) return c.pct;
    return +(c.pct - b).toFixed(2);
  }

  function teamPassesStreak(t) {
    const s = t.STRK || 0;
    if (s > 0 && !state.includeW) return false;
    if (s < 0 && !state.includeL) return false;
    const needW = state.minWinStreak > 0;
    const needL = state.minLoseStreak > 0;
    if (!needW && !needL) return true;
    if (needW && needL) {
      return s >= state.minWinStreak || s <= -state.minLoseStreak;
    }
    if (needW) return s >= state.minWinStreak;
    return s <= -state.minLoseStreak;
  }

  function l10Wins(t) {
    const m = String(t.L10 || "").match(/^(\d+)\s*-\s*(\d+)/);
    return m ? +m[1] : null;
  }

  function teamPassesL10(t) {
    const w = l10Wins(t);
    if (w == null) return state.minL10Wins === 0 && state.maxL10Wins === 10;
    if (w < state.minL10Wins) return false;
    if (w > state.maxL10Wins) return false;
    return true;
  }

  function teamPassesSearch(t) {
    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.abbr.toLowerCase().includes(q)
    );
  }

  function gamesPlayed(t) {
    const w = t.W || 0, l = t.L || 0;
    return w + l;
  }

  function rdPerGame(t) {
    const gp = gamesPlayed(t);
    if (!gp || t.DIFF == null) return null;
    return t.DIFF / gp;
  }

  function isRdSurplusDog(t) {
    const rd = rdPerGame(t);
    if (rd == null || rd <= 0) return false;
    const g = slateForTeam(t.abbr);
    if (g) return g.dog_abbr === t.abbr && g.home_abbr === t.abbr;
    return false;
  }

  function filteredTeams() {
    return state.data.teams.filter((t) => {
      if (!(teamPassesStreak(t) && teamPassesL10(t) && teamPassesSearch(t))) return false;
      if (state.todayOnly && !slateForTeam(t.abbr)) return false;
      if (state.rdSurplusDog && !isRdSurplusDog(t)) return false;
      return true;
    });
  }

  function enabledSituations() {
    return state.data.situations.filter((s) => state.situations.has(s.sc));
  }

  /** Rows for list / heat: team × situation that pass N and pct filters */
  function matchingRows() {
    const teams = filteredTeams();
    const sits = enabledSituations();
    const cat = state.category;
    const rows = [];
    for (const t of teams) {
      for (const sit of sits) {
        if (!situationTrueToday(t.abbr, sit.sc)) continue;
        const c = cell(t.abbr, sit.sc, cat);
        if (!c || c.pct == null) continue;
        if ((c.n || 0) < state.minN) continue;
        const val = metricValue(c, sit.sc);
        const b = baseline(sit.sc, cat);
        const edge = b != null ? +(c.pct - b).toFixed(2) : null;
        const cmp = state.vsBaseline ? val : c.pct;
        if (cmp < state.minPct) continue;
        rows.push({
          team: t,
          sit,
          cell: c,
          val,
          edge,
          baseline: b,
        });
      }
    }
    return rows;
  }

  function streakBadge(strk) {
    if (!strk) return '<span class="badge">—</span>';
    const cls = strk > 0 ? "w" : "l";
    const txt = strk > 0 ? `W${strk}` : `L${-strk}`;
    return `<span class="badge ${cls}">${txt}</span>`;
  }

  function colorScale(v, vsBase) {
    // Plotly colorscale endpoints
    if (vsBase) {
      // edge -15..+15
      return [
        [0, "#3a1520"],
        [0.45, "#1a2332"],
        [0.5, "#1e2a3c"],
        [0.55, "#1a2332"],
        [1, "#0f3d2e"],
      ];
    }
    return [
      [0, "#2a1520"],
      [0.4, "#1a2332"],
      [0.5, "#243044"],
      [0.6, "#1a3a32"],
      [1, "#1a5c45"],
    ];
  }

  function renderHeat() {
    const el = $("#heat-chart");
    const teams = filteredTeams();
    const sits = enabledSituations();
    const cat = state.category;

    if (!teams.length || !sits.length) {
      el.innerHTML = '<div class="empty">No teams/situations match current filters.</div>';
      return;
    }

    const z = [];
    const text = [];
    const custom = [];
    const yLabels = teams.map((t) => `${t.abbr}`);
    const xLabels = sits.map((s) => s.label.replace(/^As /, ""));

    let any = false;
    for (const t of teams) {
      const rowZ = [];
      const rowT = [];
      const rowC = [];
      for (const sit of sits) {
        if (!situationTrueToday(t.abbr, sit.sc)) {
          rowZ.push(null);
          rowT.push("");
          rowC.push(null);
          continue;
        }
        const c = cell(t.abbr, sit.sc, cat);
        if (!c || c.pct == null || (c.n || 0) < state.minN) {
          rowZ.push(null);
          rowT.push("");
          rowC.push(null);
          continue;
        }
        const val = metricValue(c, sit.sc);
        const b = baseline(sit.sc, cat);
        const edge = b != null ? +(c.pct - b).toFixed(2) : null;
        const cmp = state.vsBaseline ? val : c.pct;
        if (cmp < state.minPct) {
          rowZ.push(null);
          rowT.push("");
          rowC.push(null);
          continue;
        }
        any = true;
        rowZ.push(val);
        const edgeStr = edge == null ? "—" : (edge >= 0 ? "+" : "") + edge;
        rowT.push(
          `${t.name}<br>${sit.label}<br>${CAT_LABEL[cat]}: ${c.pct}% (${c.record}, n=${c.n})` +
            (b != null ? `<br>Baseline: ${b}% · Edge: ${edgeStr}` : "")
        );
        rowC.push({ abbr: t.abbr, sc: sit.sc });
      }
      z.push(rowZ);
      text.push(rowT);
      custom.push(rowC);
    }

    if (!any) {
      el.innerHTML = '<div class="empty">No cells meet min N / threshold. Loosen filters.</div>';
      return;
    }

    const zflat = z.flat().filter((v) => v != null);
    let zmin, zmax;
    if (state.vsBaseline) {
      const m = Math.max(8, ...zflat.map(Math.abs));
      zmin = -m;
      zmax = m;
    } else {
      zmin = Math.min(...zflat);
      zmax = Math.max(...zflat);
      if (zmax - zmin < 5) {
        zmin = Math.max(0, zmin - 5);
        zmax = Math.min(100, zmax + 5);
      }
    }

    const mid = state.vsBaseline ? 0 : 50;
    const colorscale = state.vsBaseline
      ? [
          [0, "#ff5c7a"],
          [0.5, "#1e2a3c"],
          [1, "#3ecf8e"],
        ]
      : [
          [0, "#ff5c7a"],
          [0.5, "#1e2a3c"],
          [1, "#3dd6c6"],
        ];

    const data = [
      {
        type: "heatmap",
        z,
        x: xLabels,
        y: yLabels,
        text,
        hoverinfo: "text",
        colorscale,
        zmid: mid,
        zmin,
        zmax,
        colorbar: {
          title: state.vsBaseline ? "Edge pp" : CAT_LABEL[cat],
          thickness: 12,
          tickfont: { color: "#8b9bb4", size: 10 },
          titlefont: { color: "#8b9bb4", size: 11 },
        },
        xgap: 2,
        ygap: 2,
      },
    ];

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { t: 20, r: 20, b: 90, l: 55 },
      xaxis: {
        tickangle: -35,
        tickfont: { size: 10, color: "#8b9bb4" },
        side: "bottom",
      },
      yaxis: {
        tickfont: { size: 11, color: "#e8eef7" },
        autorange: "reversed",
      },
      height: Math.max(420, teams.length * 22 + 120),
      font: { family: "IBM Plex Sans, sans-serif", color: "#e8eef7" },
    };

    Plotly.newPlot(el, data, layout, { responsive: true, displayModeBar: false }).then(() => {
      el.on("plotly_click", (ev) => {
        const pt = ev.points?.[0];
        if (!pt) return;
        const ti = yLabels.indexOf(pt.y);
        if (ti >= 0) pinTeam(teams[ti].abbr);
      });
    });
  }

  function renderScatter() {
    const el = $("#scatter-chart");
    const teams = filteredTeams();
    const cat = state.category;

    const xs = [];
    const ys = [];
    const texts = [];
    const sizes = [];
    const colors = [];
    const custom = [];

    if (state.scatterMode === "win_cover") {
      const sc = state.scatterSit;
      for (const t of teams) {
        if (!situationTrueToday(t.abbr, sc)) continue;
        const w = cell(t.abbr, sc, "win");
        const a = cell(t.abbr, sc, "ats");
        if (!w || !a || w.pct == null || a.pct == null) continue;
        const n = Math.min(w.n || 0, a.n || 0);
        if (n < state.minN) continue;
        if (state.vsBaseline) {
          const bw = baseline(sc, "win");
          const ba = baseline(sc, "ats");
          const vx = bw != null ? w.pct - bw : w.pct;
          const vy = ba != null ? a.pct - ba : a.pct;
          if (vx < state.minPct && vy < state.minPct) {
            /* still show if either interesting — filter by neither below if both raw? keep loose */
          }
          xs.push(+vx.toFixed(2));
          ys.push(+vy.toFixed(2));
        } else {
          if (w.pct < state.minPct && a.pct < state.minPct) continue;
          xs.push(w.pct);
          ys.push(a.pct);
        }
        texts.push(
          `${t.name} (${t.abbr})<br>${sc}<br>Win ${w.pct}% (${w.record}) · Cover ${a.pct}% (${a.record})<br>n≈${n} · DIFF ${t.DIFF} · ${t.STRK_raw}`
        );
        sizes.push(Math.max(8, Math.min(28, Math.sqrt(n) * 2.2)));
        colors.push(t.STRK);
        custom.push(t.abbr);
      }
    } else {
      const scX = state.scatterX;
      const scY = state.scatterY;
      for (const t of teams) {
        if (!situationTrueToday(t.abbr, scX) || !situationTrueToday(t.abbr, scY)) continue;
        const cx = cell(t.abbr, scX, cat);
        const cy = cell(t.abbr, scY, cat);
        if (!cx || !cy || cx.pct == null || cy.pct == null) continue;
        const n = Math.min(cx.n || 0, cy.n || 0);
        if (n < state.minN) continue;
        let vx = cx.pct;
        let vy = cy.pct;
        if (state.vsBaseline) {
          const bx = baseline(scX, cat);
          const by = baseline(scY, cat);
          vx = bx != null ? +(cx.pct - bx).toFixed(2) : cx.pct;
          vy = by != null ? +(cy.pct - by).toFixed(2) : cy.pct;
        }
        if (!state.vsBaseline && vx < state.minPct && vy < state.minPct) continue;
        xs.push(vx);
        ys.push(vy);
        texts.push(
          `${t.name}<br>X ${scX}: ${cx.pct}% (${cx.record}, n=${cx.n})<br>Y ${scY}: ${cy.pct}% (${cy.record}, n=${cy.n})`
        );
        sizes.push(Math.max(8, Math.min(28, Math.sqrt(n) * 2.2)));
        colors.push(t.DIFF);
        custom.push(t.abbr);
      }
    }

    if (!xs.length) {
      el.innerHTML = '<div class="empty">No points match filters for this scatter.</div>';
      return;
    }

    const xlab =
      state.scatterMode === "win_cover"
        ? (state.vsBaseline ? "Win% edge" : "Win%") + ` · ${state.scatterSit}`
        : (state.vsBaseline ? "Edge · " : "") + state.scatterX + ` (${CAT_LABEL[cat]})`;
    const ylab =
      state.scatterMode === "win_cover"
        ? (state.vsBaseline ? "Cover% edge" : "Cover%") + ` · ${state.scatterSit}`
        : (state.vsBaseline ? "Edge · " : "") + state.scatterY + ` (${CAT_LABEL[cat]})`;

    const data = [
      {
        type: "scatter",
        mode: "markers+text",
        x: xs,
        y: ys,
        text: custom,
        textposition: "top center",
        textfont: { size: 9, color: "#8b9bb4" },
        marker: {
          size: sizes,
          color: colors,
          colorscale: [
            [0, "#ff5c7a"],
            [0.5, "#5b8cff"],
            [1, "#3ecf8e"],
          ],
          colorbar: {
            title: state.scatterMode === "win_cover" ? "Streak" : "DIFF",
            thickness: 12,
            tickfont: { color: "#8b9bb4", size: 10 },
            titlefont: { color: "#8b9bb4", size: 11 },
          },
          line: { width: 1, color: "rgba(255,255,255,0.25)" },
          opacity: 0.9,
        },
        hovertext: texts,
        hoverinfo: "text",
        customdata: custom,
      },
    ];

    // reference lines at 0 if vs baseline, else baseline 50 or situation baselines
    const shapes = [];
    if (state.vsBaseline) {
      shapes.push(
        { type: "line", x0: 0, x1: 0, y0: Math.min(...ys) - 2, y1: Math.max(...ys) + 2, line: { color: "#243044", dash: "dot" } },
        { type: "line", y0: 0, y1: 0, x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, line: { color: "#243044", dash: "dot" } }
      );
    }

    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#0f141c",
      margin: { t: 24, r: 20, b: 56, l: 56 },
      xaxis: {
        title: { text: xlab, font: { size: 11, color: "#8b9bb4" } },
        gridcolor: "#1a2332",
        zerolinecolor: "#243044",
        tickfont: { color: "#8b9bb4", size: 10 },
      },
      yaxis: {
        title: { text: ylab, font: { size: 11, color: "#8b9bb4" } },
        gridcolor: "#1a2332",
        zerolinecolor: "#243044",
        tickfont: { color: "#8b9bb4", size: 10 },
      },
      height: 520,
      shapes,
      font: { family: "IBM Plex Sans, sans-serif", color: "#e8eef7" },
    };

    Plotly.newPlot(el, data, layout, { responsive: true, displayModeBar: false }).then(() => {
      el.on("plotly_click", (ev) => {
        const abbr = ev.points?.[0]?.customdata;
        if (abbr) pinTeam(abbr);
      });
    });
  }

  function slateForTeam(abbr) {
    const slate = state.data.slate;
    if (!slate?.games) return null;
    return slate.games.find((g) => g.home_abbr === abbr || g.away_abbr === abbr) || null;
  }


  /** Situation codes that are actually true for this team on today's slate. */
  function todaysSituationsForTeam(abbr) {
    const g = slateForTeam(abbr);
    if (!g) return new Set();
    const out = new Set(["all_games", "is_regular_season"]);
    const isHome = g.home_abbr === abbr;
    const isAway = g.away_abbr === abbr;
    if (isHome) out.add("is_home");
    if (isAway) out.add("is_away");
    const isDog = g.dog_abbr === abbr;
    const isFav = g.fav_abbr === abbr;
    if (isDog) out.add("is_dog");
    if (isFav) out.add("is_fav");
    if (isHome && isFav) out.add("is_home_fav");
    if (isHome && isDog) out.add("is_home_dog");
    if (isAway && isFav) out.add("is_away_fav");
    if (isAway && isDog) out.add("is_away_dog");
    const team = state.data.teams.find((t) => t.abbr === abbr);
    if (team && typeof team.STRK === "number") {
      if (team.STRK > 0) out.add("is_after_win");
      else if (team.STRK < 0) out.add("is_after_loss");
    }
    return out;
  }

  function situationTrueToday(abbr, sc) {
    if (!state.todayOnly) return true;
    return todaysSituationsForTeam(abbr).has(sc);
  }


  function rowFilterTag(r) {
    const tags = [];
    const sc = r.sit.sc;
    if (state.category === "ats" && (sc === "is_away_dog" || sc === "is_home_dog" || sc === "is_dog")) {
      tags.push("ATS dog");
    }
    if (state.rdSurplusDog && isRdSurplusDog(r.team)) tags.push("home dog + RD>0 (2026 snapshot)");
    if (!tags.length) return "";
    return ` <span style="color:var(--muted);font-size:0.7rem">according to ${tags.join(" + ")}</span>`;
  }

  function accordingToLine() {
    const cat = CAT_LABEL[state.category] || state.category;
    const sits = enabledSituations().map((s) => s.label.replace(/^As /, ""));
    const { lo, hi } = yearRange();
    const bits = [];
    if (sits.length && sits.length <= 6) bits.push(sits.join(", "));
    else if (sits.length) bits.push(`${sits.length} situations`);
    bits.push(cat);
    bits.push(`baseline ${lo}–${hi}`);
    if (state.todayOnly) bits.push("today’s slate only");
    if (state.rdSurplusDog) bits.push("home ATS dog AND RD/G>0 (2026 ESPN snapshot, look-ahead)");
    if (state.vsBaseline) bits.push("vs baseline");
    return "According to " + bits.join(" · ");
  }

  function renderList() {
    const wrap = $("#list-table");
    const acc = $("#according-to");
    if (acc) acc.textContent = accordingToLine();
    let rows = matchingRows();

    const colAccessors = {
      team: (r) => r.team.abbr,
      streak: (r) => r.team.STRK,
      l10: (r) => r.team.L10,
      situation: (r) => r.sit.label,
      record: (r) => r.cell.record || "",
      pct: (r) => r.cell.pct,
      n: (r) => r.cell.n || 0,
      edge: (r) => (r.edge == null ? -999 : r.edge),
      slate: (r) => (slateForTeam(r.team.abbr)?.name || ""),
    };

    rows.sort((a, b) => {
      const av = colAccessors[state.sortCol]?.(a);
      const bv = colAccessors[state.sortCol]?.(b);
      if (av < bv) return -1 * state.sortDir;
      if (av > bv) return 1 * state.sortDir;
      return 0;
    });

    $("#list-count").textContent = `${rows.length} rows`;

    if (!rows.length) {
      wrap.innerHTML = '<div class="empty">No rows match. Loosen min N, threshold, streak/L10 filters, or turn off Today only.</div>';
      return;
    }

    const hasSlate = !!state.data.slate?.games?.length;
    let html = `<div class="table-wrap"><table><thead><tr>
      <th data-col="team">Team</th>
      <th data-col="streak">Streak</th>
      <th data-col="l10">L10</th>
      <th data-col="situation">Situation</th>
      <th class="num" data-col="record">Record</th>
      <th class="num" data-col="pct">Pct</th>
      <th class="num" data-col="n">N</th>
      <th class="num" data-col="edge">vs Baseline</th>
      ${hasSlate ? '<th data-col="slate">Today</th>' : ""}
    </tr></thead><tbody>`;

    for (const r of rows) {
      const edgeCls = r.edge == null ? "" : r.edge >= 0 ? "edge-pos" : "edge-neg";
      const edgeTxt = r.edge == null ? "—" : (r.edge >= 0 ? "+" : "") + r.edge;
      const g = hasSlate ? slateForTeam(r.team.abbr) : null;
      let slateCell = "";
      if (hasSlate) {
        if (!g) slateCell = "—";
        else {
          const role =
            g.dog_abbr === r.team.abbr
              ? `DOG ${g.dog_side}`
              : g.home_abbr === r.team.abbr
              ? "HOME"
              : "AWAY";
          const ml =
            g.home_abbr === r.team.abbr ? g.dk_ml_home : g.dk_ml_away;
          const wp =
            g.home_abbr === r.team.abbr ? g.espn_home_wp : g.espn_away_wp;
          const trip = g.triple ? ' <span class="badge triple">TRIPLE</span>' : "";
          slateCell = `${g.name} · ${role} ${ml || ""} · ESPN ${wp != null ? wp.toFixed(1) + "%" : "—"}${trip}`;
        }
      }
      const pin = state.pinned === r.team.abbr ? "pinned" : "";
      html += `<tr class="${pin}" data-abbr="${r.team.abbr}">
        <td><strong>${r.team.abbr}</strong> <span style="color:var(--muted)">${r.team.name}</span></td>
        <td>${streakBadge(r.team.STRK)}</td>
        <td class="num">${r.team.L10}</td>
        <td>${r.sit.label}${rowFilterTag(r)}</td>
        <td class="num">${r.cell.record || "—"}</td>
        <td class="num">${r.cell.pct}%</td>
        <td class="num">${r.cell.n ?? "—"}</td>
        <td class="num ${edgeCls}">${edgeTxt}${r.baseline != null ? ` <span style="color:var(--muted);font-size:0.7rem">(${r.baseline}%)</span>` : ""}</td>
        ${hasSlate ? `<td>${slateCell}</td>` : ""}
      </tr>`;
    }
    html += "</tbody></table></div>";
    wrap.innerHTML = html;

    $$("th[data-col]", wrap).forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (state.sortCol === col) state.sortDir *= -1;
        else {
          state.sortCol = col;
          state.sortDir = col === "team" || col === "situation" ? 1 : -1;
        }
        renderList();
        saveState();
      });
    });
    $$("tbody tr", wrap).forEach((tr) => {
      tr.addEventListener("click", () => pinTeam(tr.dataset.abbr));
    });
  }

  function renderToday() {
    const panel = $("#today-panel");
    const el = $("#today-grid");
    const slate = state.data.slate;
    if (!slate?.games?.length) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    $("#today-date").textContent = slate.date || "latest";

    // Highlight games where dog matches strong TR home/away dog cell
    const strong = [];
    const others = [];
    for (const g of slate.games) {
      const sc = g.sc || (g.dog_side === "home" ? "is_home_dog" : "is_away_dog");
      const abbr = g.dog_abbr;
      const winC = abbr ? cell(abbr, sc, "win") : null;
      const atsC = abbr ? cell(abbr, sc, "ats") : null;
      const bw = baseline(sc, "win");
      const ba = baseline(sc, "ats");
      const winEdge = winC && bw != null ? +(winC.pct - bw).toFixed(2) : null;
      const coverEdge = atsC && ba != null ? +(atsC.pct - ba).toFixed(2) : null;
      const isStrong =
        g.triple ||
        (winC && (winC.n || 0) >= state.minN && winEdge != null && winEdge >= 5) ||
        (atsC && (atsC.n || 0) >= state.minN && coverEdge != null && coverEdge >= 5) ||
        (winC && winC.pct >= 50 && (winC.n || 0) >= state.minN);
      const item = { g, sc, winC, atsC, winEdge, coverEdge, isStrong };
      (isStrong ? strong : others).push(item);
    }

    const renderCard = ({ g, sc, winC, atsC, winEdge, coverEdge, isStrong }) => {
      const trip = g.triple ? '<span class="badge triple">TRIPLE</span>' : "";
      const we =
        winEdge == null ? "" : `<span class="${winEdge >= 0 ? "edge-pos" : "edge-neg"}">${winEdge >= 0 ? "+" : ""}${winEdge}pp win</span>`;
      const ce =
        coverEdge == null ? "" : `<span class="${coverEdge >= 0 ? "edge-pos" : "edge-neg"}">${coverEdge >= 0 ? "+" : ""}${coverEdge}pp cover</span>`;
      return `<div class="game-card ${isStrong || g.triple ? "hit" : ""}">
        <div class="matchup"><span>${g.name}</span>${trip}</div>
        <div class="meta">
          DK ${g.away_abbr} ${g.dk_ml_away || "—"} / ${g.home_abbr} ${g.dk_ml_home || "—"}<br>
          ESPN WP ${g.away_abbr} ${g.espn_away_wp != null ? g.espn_away_wp.toFixed(1) : "—"}% · ${g.home_abbr} ${g.espn_home_wp != null ? g.espn_home_wp.toFixed(1) : "—"}%<br>
          Dog: <strong>${g.dog_abbr || "—"}</strong> (${g.dog_side || "—"}) ${g.dog_ml || ""} · sit ${sc || "—"}
        </div>
        <div class="tr-line">
          TR ${g.dog_abbr || ""} ${sc || ""}:<br>
          Win ${winC ? `${winC.pct}% (${winC.record}, n=${winC.n})` : "—"} ${we}<br>
          Cover ${atsC ? `${atsC.pct}% (${atsC.record}, n=${atsC.n})` : "—"} ${ce}
        </div>
      </div>`;
    };

    el.innerHTML =
      (strong.length
        ? `<div style="grid-column:1/-1;color:var(--warn);font-size:0.8rem;margin-bottom:4px;">Strong / triple matches (${strong.length})</div>` +
          strong.map(renderCard).join("")
        : "") +
      (others.length
        ? `<div style="grid-column:1/-1;color:var(--muted);font-size:0.8rem;margin:8px 0 4px;">Rest of slate (${others.length})</div>` +
          others.map(renderCard).join("")
        : "");
    const tabHost = $("#today-tab-grid");
    if (tabHost) tabHost.innerHTML = el.innerHTML;
  }

  function pinTeam(abbr) {
    state.pinned = abbr;
    const t = state.data.teams.find((x) => x.abbr === abbr);
    const bar = $("#detail-bar");
    if (!t) {
      bar.classList.remove("visible");
      return;
    }
    const g = slateForTeam(abbr);
    bar.classList.add("visible");
    $("#detail-text").innerHTML = `<strong>${t.name} (${t.abbr})</strong> · ${t.W}-${t.L} · ${streakBadge(t.STRK)} · L10 ${t.L10} · DIFF ${t.DIFF >= 0 ? "+" : ""}${t.DIFF}` +
      (g
        ? ` · Today: ${g.name} · DK ${g.home_abbr === abbr ? g.dk_ml_home : g.dk_ml_away} · ESPN ${(g.home_abbr === abbr ? g.espn_home_wp : g.espn_away_wp)?.toFixed?.(1) ?? "—"}%`
        : "");
    renderList();
  }

  function updateStats() {
    const rows = matchingRows();
    const teams = new Set(rows.map((r) => r.team.abbr));
    $("#stat-teams").textContent = `${teams.size} teams`;
    $("#stat-rows").textContent = `${rows.length} cells`;
    $("#stat-cat").textContent = CAT_LABEL[state.category];
    $("#stat-n").textContent = `min N ${state.minN}`;
  }

  function renderAll() {
    updateStats();
    const tab = state.tab;
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".view-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.view !== tab));
    if (tab === "heat") renderHeat();
    if (tab === "scatter") renderScatter();
    if (tab === "list") renderList();
    if (tab === "today") renderToday();
    // always keep today finder available in stacked? tabs only
    renderToday();
    saveState();
  }

  function buildSituationChecks() {
    const box = $("#sit-list");
    box.innerHTML = "";
    for (const s of state.data.situations) {
      const id = "sit-" + s.sc;
      const lab = document.createElement("label");
      lab.innerHTML = `<input type="checkbox" id="${id}" data-sc="${s.sc}" ${state.situations.has(s.sc) ? "checked" : ""}> ${s.label}`;
      box.appendChild(lab);
    }
    box.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.sc) {
        if (t.checked) state.situations.add(t.dataset.sc);
        else state.situations.delete(t.dataset.sc);
        renderAll();
      }
    });
  }

  function setSituationPreset(kind) {
    const all = state.data.situations.map((s) => s.sc);
    const groups = state.data.situation_groups || {};
    let next = [];
    if (kind === "all") next = all;
    else if (kind === "none") next = [];
    else if (kind === "dogs") next = groups.dogs || [];
    else if (kind === "favs") next = groups.favs || [];
    else if (kind === "location") next = groups.location || [];
    else if (kind === "rest") next = groups.rest || [];
    state.situations = new Set(next);
    $$("#sit-list input").forEach((inp) => {
      inp.checked = state.situations.has(inp.dataset.sc);
    });
    renderAll();
  }


  function fillYearSelects() {
    const pack = state.data.baseline_years || {};
    const years = pack.years || [];
    const opts = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    const loEl = $("#year-lo");
    const hiEl = $("#year-hi");
    if (!loEl || !hiEl) return;
    loEl.innerHTML = opts;
    hiEl.innerHTML = opts;
    const { lo, hi } = yearRange();
    state.yearLo = lo;
    state.yearHi = hi;
    loEl.value = String(lo);
    hiEl.value = String(hi);
    updateYearSpanLabel();
  }

  function setYearRange(lo, hi, render) {
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    state.yearLo = lo;
    state.yearHi = hi;
    const loEl = $("#year-lo");
    const hiEl = $("#year-hi");
    if (loEl) loEl.value = String(lo);
    if (hiEl) hiEl.value = String(hi);
    updateYearSpanLabel();
    if (render !== false) renderAll();
  }

  function fillScatterSelects() {
    const opts = state.data.situations
      .map((s) => `<option value="${s.sc}">${s.label}</option>`)
      .join("");
    $("#scatter-x").innerHTML = opts;
    $("#scatter-y").innerHTML = opts;
    $("#scatter-sit").innerHTML = opts;
    $("#scatter-x").value = state.scatterX;
    $("#scatter-y").value = state.scatterY;
    $("#scatter-sit").value = state.scatterSit;
  }

  function bindControls() {
    $$(".seg button").forEach((b) => {
      b.addEventListener("click", () => {
        state.category = b.dataset.cat;
        $$(".seg button").forEach((x) => x.classList.toggle("active", x === b));
        renderAll();
      });
    });
    $$(".preset-row button").forEach((b) => {
      b.addEventListener("click", () => setSituationPreset(b.dataset.preset));
    });
    $("#min-n").addEventListener("input", (e) => {
      state.minN = +e.target.value;
      $("#min-n-val").textContent = state.minN;
      renderAll();
    });
    $("#min-pct").addEventListener("input", (e) => {
      state.minPct = +e.target.value;
      $("#min-pct-val").textContent = state.minPct;
      renderAll();
    });
    $("#vs-baseline").addEventListener("change", (e) => {
      state.vsBaseline = e.target.checked;
      renderAll();
    });
    const onYearChange = () => {
      let lo = +$("#year-lo").value;
      let hi = +$("#year-hi").value;
      setYearRange(lo, hi);
    };
    $("#year-lo").addEventListener("change", onYearChange);
    $("#year-hi").addEventListener("change", onYearChange);
    $$("[data-years]").forEach((b) => {
      b.addEventListener("click", () => {
        const pack = state.data.baseline_years || {};
        const minY = pack.min || 2007;
        const maxY = pack.max || 2026;
        const p = b.dataset.years;
        if (p === "last5") setYearRange(maxY - 4, maxY);
        else if (p === "last10") setYearRange(maxY - 9, maxY);
        else setYearRange(minY, maxY);
      });
    });
    $("#min-w-streak").addEventListener("input", (e) => {
      state.minWinStreak = +e.target.value;
      $("#min-w-val").textContent = state.minWinStreak === 0 ? "any" : state.minWinStreak;
      renderAll();
    });
    $("#min-l-streak").addEventListener("input", (e) => {
      state.minLoseStreak = +e.target.value;
      $("#min-l-val").textContent = state.minLoseStreak === 0 ? "any" : state.minLoseStreak;
      renderAll();
    });
    $("#include-w").addEventListener("change", (e) => {
      state.includeW = e.target.checked;
      renderAll();
    });
    $("#include-l").addEventListener("change", (e) => {
      state.includeL = e.target.checked;
      renderAll();
    });
    function syncL10Labels() {
      $("#min-l10-val").textContent = state.minL10Wins === 0 ? "any" : state.minL10Wins;
      $("#max-l10-val").textContent = state.maxL10Wins === 10 ? "any" : state.maxL10Wins;
    }
    $("#min-l10").addEventListener("input", (e) => {
      state.minL10Wins = +e.target.value;
      if (state.minL10Wins > state.maxL10Wins) {
        state.maxL10Wins = state.minL10Wins;
        $("#max-l10").value = state.maxL10Wins;
      }
      syncL10Labels();
      renderAll();
    });
    $("#max-l10").addEventListener("input", (e) => {
      state.maxL10Wins = +e.target.value;
      if (state.maxL10Wins < state.minL10Wins) {
        state.minL10Wins = state.maxL10Wins;
        $("#min-l10").value = state.minL10Wins;
      }
      syncL10Labels();
      renderAll();
    });
    $$("[data-l10]").forEach((b) => {
      b.addEventListener("click", () => {
        const p = b.dataset.l10;
        if (p === "any") { state.minL10Wins = 0; state.maxL10Wins = 10; }
        else if (p === "hot") { state.minL10Wins = 7; state.maxL10Wins = 10; }
        else if (p === "even") { state.minL10Wins = 4; state.maxL10Wins = 6; }
        else if (p === "cold") { state.minL10Wins = 0; state.maxL10Wins = 3; }
        $("#min-l10").value = state.minL10Wins;
        $("#max-l10").value = state.maxL10Wins;
        syncL10Labels();
        renderAll();
      });
    });
    $("#today-only").addEventListener("change", (e) => {
      state.todayOnly = e.target.checked;
      renderAll();
    });
    $("#rd-surplus-dog").addEventListener("change", (e) => {
      state.rdSurplusDog = e.target.checked;
      renderAll();
    });
    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderAll();
    });
    $$(".tabs button").forEach((b) => {
      b.addEventListener("click", () => {
        state.tab = b.dataset.tab;
        renderAll();
      });
    });
    $("#scatter-mode").addEventListener("change", (e) => {
      state.scatterMode = e.target.value;
      $("#scatter-sit-wrap").style.display = state.scatterMode === "win_cover" ? "" : "none";
      $("#scatter-xy-wrap").style.display = state.scatterMode === "situations" ? "" : "none";
      renderAll();
    });
    $("#scatter-x").addEventListener("change", (e) => {
      state.scatterX = e.target.value;
      renderAll();
    });
    $("#scatter-y").addEventListener("change", (e) => {
      state.scatterY = e.target.value;
      renderAll();
    });
    $("#scatter-sit").addEventListener("change", (e) => {
      state.scatterSit = e.target.value;
      renderAll();
    });
    $("#unpin").addEventListener("click", () => {
      state.pinned = null;
      $("#detail-bar").classList.remove("visible");
      renderList();
    });
  }

  function applyInitialControlValues() {
    $$(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.cat === state.category));
    $("#min-n").value = state.minN;
    $("#min-n-val").textContent = state.minN;
    $("#min-pct").value = state.minPct;
    $("#min-pct-val").textContent = state.minPct;
    $("#vs-baseline").checked = state.vsBaseline;
    const loEl = $("#year-lo");
    const hiEl = $("#year-hi");
    if (loEl) loEl.value = String(state.yearLo);
    if (hiEl) hiEl.value = String(state.yearHi);
    updateYearSpanLabel();
    $("#min-w-streak").value = state.minWinStreak;
    $("#min-w-val").textContent = state.minWinStreak === 0 ? "any" : state.minWinStreak;
    $("#min-l-streak").value = state.minLoseStreak;
    $("#min-l-val").textContent = state.minLoseStreak === 0 ? "any" : state.minLoseStreak;
    $("#include-w").checked = state.includeW;
    $("#include-l").checked = state.includeL;
    $("#min-l10").value = state.minL10Wins;
    $("#max-l10").value = state.maxL10Wins;
    $("#min-l10-val").textContent = state.minL10Wins === 0 ? "any" : state.minL10Wins;
    $("#max-l10-val").textContent = state.maxL10Wins === 10 ? "any" : state.maxL10Wins;
    $("#today-only").checked = state.todayOnly;
    $("#rd-surplus-dog").checked = state.rdSurplusDog;
    $("#scatter-mode").value = state.scatterMode;
    $("#scatter-sit-wrap").style.display = state.scatterMode === "win_cover" ? "" : "none";
    $("#scatter-xy-wrap").style.display = state.scatterMode === "situations" ? "" : "none";
  }

  async function init() {
    loadStateFromHash();
    if (!state.situations.size) {
      try {
        const saved = localStorage.getItem("mlb-tr-explorer");
        if (saved && !location.hash) {
          const o = JSON.parse(saved);
          Object.assign(state, {
            ...o,
            situations: new Set(o.situations || []),
          });
        }
      } catch (_) {}
    }

    const res = await fetch("data.json");
    state.data = await res.json();

    if (!state.situations.size) {
      state.situations = new Set(state.data.situations.map((s) => s.sc));
    }
    fillYearSelects();

    const todayEl = $("#today-only");
    const hasSlate = !!(state.data.slate?.games?.length);
    todayEl.disabled = !hasSlate;
    if (!hasSlate) {
      state.todayOnly = false;
      todayEl.checked = false;
    }
    todayEl.title = hasSlate
      ? "Only keep situations that apply to each team on today's slate (home/away, fav/dog, after win/loss, all games)."
      : "No today's slate loaded.";

    buildSituationChecks();
    fillScatterSelects();
    bindControls();
    applyInitialControlValues();

    const slateNote = state.data.slate?.date
      ? `Slate: ${state.data.slate.date} (${state.data.slate.games.length} games)`
      : "No slate files found";
    $("#meta-line").textContent = `Generated ${state.data.generated_at} · ${state.data.meta.n_teams} teams · ${state.data.meta.n_situations} situations · ${slateNote}`;

    if (!state.data.slate?.games?.length) {
      const tb = $('.tabs button[data-tab="today"]');
      if (tb) tb.style.display = "none";
    }

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
