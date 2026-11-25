// Menu system: main menu, hangar, settings, pause and results screens.
// Keyboard-first (arrows / Enter / Esc) like a console game, mouse works too.
// The game talks to it only through the `api` object passed to createMenu().

export function createMenu(api) {
  const screens = {};
  document.querySelectorAll(".screen").forEach((el) => {
    screens[el.dataset.screen] = el;
  });
  const stack = [];
  let focusEl = null;

  // ---------- build dynamic content ----------
  const mapTiles = [...document.querySelectorAll("#map-tiles .tile")];
  const planeRow = document.getElementById("plane-tiles");
  const planeTiles = api.planes.map((p, i) => {
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.type = "button";
    tile.dataset.row = "1";
    tile.dataset.plane = String(i);
    const name = document.createElement("span");
    name.className = "tile-name";
    name.textContent = p.name;
    const desc = document.createElement("span");
    desc.className = "tile-desc";
    desc.textContent = p.tagline;
    const bars = document.createElement("div");
    bars.className = "stat-bars";
    for (const [label, value] of Object.entries(p.bars)) {
      const l = document.createElement("label");
      l.textContent = label.toUpperCase();
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("i");
      fill.style.width = `${Math.round(value * 100)}%`;
      bar.appendChild(fill);
      bars.append(l, bar);
    }
    tile.append(name, desc, bars);
    planeRow.appendChild(tile);
    return tile;
  });

  const settingsList = document.getElementById("settings-list");
  const settingRows = api.settings.map((s, i) => {
    const row = document.createElement("div");
    row.className = "opt-row";
    row.tabIndex = 0;
    row.dataset.row = String(i);
    row.dataset.setting = s.id;
    const text = document.createElement("div");
    const label = document.createElement("span");
    label.className = "opt-label";
    label.textContent = s.label;
    const hint = document.createElement("span");
    hint.className = "opt-hint";
    hint.textContent = s.hint;
    text.append(label, hint);
    const ctl = document.createElement("div");
    ctl.className = "opt-ctl";
    const left = document.createElement("button");
    left.className = "arrow";
    left.type = "button";
    left.tabIndex = -1;
    left.textContent = "◀";
    const value = document.createElement("span");
    value.className = "opt-value";
    const right = document.createElement("button");
    right.className = "arrow";
    right.type = "button";
    right.tabIndex = -1;
    right.textContent = "▶";
    ctl.append(left, value, right);
    row.append(text, ctl);
    left.addEventListener("click", (e) => { e.stopPropagation(); change(s, -1); });
    right.addEventListener("click", (e) => { e.stopPropagation(); change(s, 1); });
    row.addEventListener("click", () => change(s, 1));
    settingsList.appendChild(row);
    return { row, value, setting: s };
  });

  function change(setting, dir) {
    setting.step(dir);
    refresh();
  }

  // ---------- state sync ----------
  function refresh() {
    mapTiles.forEach((t) => t.classList.toggle("selected", t.dataset.map === api.getMap()));
    planeTiles.forEach((t, i) => t.classList.toggle("selected", i === api.getPlaneIdx()));
    settingRows.forEach(({ value, setting }) => { value.textContent = setting.get(); });
    document.getElementById("best-score").textContent = `Best score ${api.best()}`;
  }

  // ---------- focus handling ----------
  function itemsOf(screen) {
    return [...screen.querySelectorAll("[data-row]")];
  }

  function setFocus(el) {
    if (focusEl) focusEl.classList.remove("focus");
    focusEl = el;
    if (el) {
      el.classList.add("focus");
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }

  function top() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  function focusFirst(screen) {
    const items = itemsOf(screen);
    const selected = items.find((i) => i.classList.contains("selected"));
    setFocus(selected || items[0] || null);
  }

  function move(dRow, dCol) {
    const screen = screens[top()];
    if (!screen || !focusEl) return;
    const items = itemsOf(screen);
    const rows = [...new Set(items.map((i) => Number(i.dataset.row)))].sort((a, b) => a - b);
    const curRow = Number(focusEl.dataset.row);
    const inRow = items.filter((i) => Number(i.dataset.row) === curRow);
    if (dRow) {
      const idx = rows.indexOf(curRow);
      const nextRow = rows[(idx + dRow + rows.length) % rows.length];
      const next = items.filter((i) => Number(i.dataset.row) === nextRow);
      const col = Math.min(inRow.indexOf(focusEl), next.length - 1);
      setFocus(next[Math.max(0, col)]);
    } else if (dCol) {
      const settingRow = settingRows.find((r) => r.row === focusEl);
      if (settingRow) {
        change(settingRow.setting, dCol);
      } else if (inRow.length > 1) {
        const idx = inRow.indexOf(focusEl);
        setFocus(inRow[(idx + dCol + inRow.length) % inRow.length]);
      }
    }
  }

  // ---------- screen stack ----------
  function show(name) {
    Object.entries(screens).forEach(([key, el]) => el.classList.toggle("active", key === name));
    refresh();
    if (name) focusFirst(screens[name]);
  }

  function open(name) {
    if (top() !== name) stack.push(name);
    show(name);
  }

  function replace(name) {
    stack.length = 0;
    open(name);
  }

  function back() {
    if (stack.length > 1) {
      stack.pop();
      show(top());
      return true;
    }
    return false;
  }

  function closeAll() {
    stack.length = 0;
    show(null);
    setFocus(null);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  // ---------- activation ----------
  function activate(el) {
    if (el.dataset.map) {
      api.setMap(el.dataset.map);
      refresh();
      return;
    }
    if (el.dataset.plane !== undefined) {
      api.setPlane(Number(el.dataset.plane));
      refresh();
      return;
    }
    const action = el.dataset.action;
    if (action === "back") {
      if (!back() && top() === "pause") api.actions.resume();
      return;
    }
    if (action === "hangar" || action === "settings" || action === "howto") {
      open(action);
      return;
    }
    api.actions[action]?.();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action], [data-map], [data-plane]");
    if (el && top() && screens[top()].contains(el)) activate(el);
  });
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-row]");
    if (el && top() && screens[top()].contains(el)) setFocus(el);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
      e.preventDefault();
      if (top()) {
        if (!back() && top() === "pause") api.actions.resume();
      } else if (api.getState() === "PLAYING") {
        api.actions.pause();
      }
      return;
    }
    if (!top()) return;
    switch (e.code) {
      case "ArrowUp": case "KeyW": e.preventDefault(); move(-1, 0); break;
      case "ArrowDown": case "KeyS": e.preventDefault(); move(1, 0); break;
      case "ArrowLeft": case "KeyA": e.preventDefault(); move(0, -1); break;
      case "ArrowRight": case "KeyD": e.preventDefault(); move(0, 1); break;
      case "Enter": case "Space":
        e.preventDefault();
        if (focusEl && !settingRows.some((r) => r.row === focusEl)) activate(focusEl);
        else if (focusEl) change(settingRows.find((r) => r.row === focusEl).setting, 1);
        break;
      default: break;
    }
  });

  return {
    open,
    replace,
    closeAll,
    refresh,
    back,
    isOpen: () => stack.length > 0,
    current: top,
  };
}
