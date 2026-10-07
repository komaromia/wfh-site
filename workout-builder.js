(function () {
  "use strict";

  const equipment = [
    ["", "Bodyweight"], ["dumbbells", "Dumbbells"], ["kettlebell", "Kettlebell"],
    ["bands", "Resistance bands"], ["medicineBall", "Medicine ball"], ["suspension", "TRX"],
    ["pullUpBar", "Pull-up bar"], ["jumpRope", "Jump rope"], ["mat", "Mat"], ["chair", "Sturdy chair"],
    ["bench", "Bench"], ["stairs", "Stairs or step"], ["stabilityBall", "Fitball"], ["foamRoller", "Foam roller"],
    ["wall", "Free wall"], ["barbell", "Barbell & plates"], ["squatRack", "Squat rack"], ["ezBar", "EZ curl bar"],
    ["cable", "Cable station"], ["machines", "Weight machines"], ["dipBars", "Dip bars"], ["rings", "Gymnastic rings"],
    ["abWheel", "Ab wheel"], ["treadmill", "Treadmill"], ["exerciseBike", "Exercise bike"],
    ["elliptical", "Elliptical"], ["rower", "Rowing machine"]
  ];
  const equipmentName = Object.fromEntries(equipment);
  const muscles = {
    chest: ["chest"], back: ["back"], shoulders: ["shoulders"], arms: ["biceps", "triceps"],
    core: ["core"], glutes: ["glutes"], legs: ["quads", "hamstrings", "calves"], fullBody: ["fullBody"]
  };
  const muscleName = { chest: "chest", back: "back", shoulders: "shoulders", biceps: "biceps", triceps: "triceps", quads: "quads", hamstrings: "hamstrings", glutes: "glutes", calves: "calves", core: "core", fullBody: "full body" };
  const formatForKind = { straightSets: "strength", superset: "strength", intervals: "hiit", emom: "emom", amrap: "amrap", flow: "auto", stopwatch: "auto" };
  const kindName = { straightSets: "sets", superset: "superset", intervals: "intervals", emom: "EMOM", amrap: "AMRAP", flow: "flow", stopwatch: "stopwatch" };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, Number(value) || low));
  const text = (value, fallback = "", max = 80) => String(value || fallback).trim().slice(0, max);
  const slug = (value) => text(value, "exercise").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "exercise";
  const uid = () => globalThis.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

  // The exercise list shipped with the app (tools/site/build_catalog.py): [id, name, needs, muscles, pattern, unilateral, timed, impact].
  const catalog = (globalThis.WFH_CATALOG || []).map(([id, name, needs, muscleList, pattern, unilateral, timed, impact]) => ({
    id, name, needs, muscles: muscleList, pattern, unilateral: Boolean(unilateral), timed: Boolean(timed), impact: Boolean(impact),
    search: `${name} ${needs.map((item) => equipmentName[item] || item).join(" ")} ${muscleList.map((item) => muscleName[item] || item).join(" ")} ${pattern}`.toLowerCase()
  }));
  const catalogByID = new Map(catalog.map((item) => [item.id, item]));

  // An exercise on the page: a catalog one (fixed facts, the app resolves it by ID) or a custom one (editable facts, travels in the file).
  function fromCatalog(entry) {
    return { catalog: true, id: entry.id, name: entry.name, equipment: entry.needs.slice(), muscles: entry.muscles.slice(), pattern: entry.pattern, timed: entry.timed, perSide: entry.unilateral };
  }

  function fromFile(item) {
    const known = catalogByID.get(item.id);
    if (known) {
      const result = fromCatalog(known);
      result.perSide = Boolean(item.perSide);
      return result;
    }
    return {
      catalog: false, id: item.id, source: item, name: text(item.name, "Exercise"),
      equipment: Array.isArray(item.equipment) ? item.equipment.filter((entry) => typeof entry === "string").slice(0, 6) : [],
      muscles: Array.isArray(item.muscles) ? item.muscles.filter((entry) => typeof entry === "string").slice(0, 6) : ["fullBody"],
      pattern: ["squat", "hinge", "lunge", "push", "pull", "core", "cardio", "mobility"].includes(item.pattern) ? item.pattern : "core",
      timed: Number.isFinite(item.seconds) && !Number.isFinite(item.reps), perSide: Boolean(item.perSide),
      bodyParts: Array.isArray(item.bodyParts) ? item.bodyParts : null
    };
  }

  // Flow steps are always timed; sets/EMOM/AMRAP exercises are timed when the exercise is; intervals and stopwatch carry no prescription.
  function usesSeconds(row, kind) {
    if (kind === "flow") return true;
    return Boolean(row.exercise) && row.exercise.timed && kind !== "intervals" && kind !== "stopwatch";
  }

  function exerciseData(row, kind) {
    const ex = row.exercise;
    const name = ex.catalog ? ex.name : text(row.querySelector(".exercise-name").value);
    const seconds = usesSeconds(row, kind);
    const value = clamp(row.querySelector(".exercise-value").value, seconds ? 5 : 1, seconds ? 3600 : 200);
    const source = ex.source || {};
    const item = {
      id: ex.id || `web-${slug(name)}-${row.dataset.id}`,
      name,
      equipment: ex.equipment.slice(),
      muscles: ex.muscles.slice(),
      pattern: ex.pattern,
      perSide: row.querySelector(".exercise-side").checked
    };
    if (!ex.catalog) {
      item.timed = kind === "flow" || kind === "intervals" || seconds;
      item.bodyParts = ex.bodyParts || [bodyForExercise(ex)];
      item.steps = Array.isArray(source.steps) ? source.steps.slice(0, 20).map((entry) => text(entry, "", 300)) : [];
      item.cues = Array.isArray(source.cues) ? source.cues.slice(0, 10).map((entry) => text(entry, "", 120)) : [];
    }
    if (kind === "intervals" || kind === "stopwatch") {
      if (Number.isFinite(source.reps)) item.reps = source.reps;
      if (Number.isFinite(source.seconds)) item.seconds = source.seconds;
    } else if (seconds) item.seconds = value;
    else item.reps = value;
    const load = text(row.querySelector(".exercise-load").value);
    if (load) item.load = load;
    return item;
  }

  function bodyForExercise(item) {
    if (Array.isArray(item.bodyParts) && muscles[item.bodyParts[0]]) return item.bodyParts[0];
    const values = Array.isArray(item.muscles) ? item.muscles : [];
    return Object.keys(muscles).find((key) => muscles[key].some((muscle) => values.includes(muscle))) || "fullBody";
  }

  function buildWorkout(form, blockElements) {
    const blocks = blockElements.map((block) => {
      const kind = block.querySelector(".block-kind").value;
      return {
        kind,
        title: text(block.querySelector(".block-title").value, "Workout"),
        rounds: clamp(block.querySelector(".block-rounds").value, 1, 30),
        workSeconds: kind === "intervals" || kind === "emom" ? clamp(block.querySelector(".block-work").value, 0, 600) : 0,
        restSeconds: ["straightSets", "superset", "intervals"].includes(kind) ? clamp(block.querySelector(".block-rest").value, 0, 600) : 0,
        capSeconds: kind === "amrap" ? clamp(block.querySelector(".block-cap").value, 1, 60) * 60 : 0,
        tone: block.dataset.tone || (kind === "flow" ? "warmup" : "work"),
        exercises: Array.from(block.querySelectorAll(".exercise-row")).map((row) => exerciseData(row, kind))
      };
    });
    const firstKind = blocks[0] ? blocks[0].kind : "straightSets";
    const file = {
      schemaVersion: 1,
      app: "KWorkout",
      title: text(form.elements.title.value, "My workout"),
      minutes: clamp(form.elements.minutes.value, 5, 180),
      focus: form.elements.focus.value,
      format: blocks.length === 1 ? formatForKind[firstKind] : "auto",
      intensity: form.elements.intensity.value,
      quiet: Boolean(form.elements.quiet.checked),
      blocks
    };
    const author = text(form.elements.author.value);
    if (author) file.author = author;
    if (form.notes) file.notes = form.notes;
    return file;
  }

  function validateWorkout(file) {
    if (!file || typeof file !== "object" || file.schemaVersion !== 1 || !Array.isArray(file.blocks)) return "This isn't a supported WFH workout file.";
    if (typeof file.title !== "string" || !file.title) return "Give your workout a name.";
    if (!file.blocks.length) return "Add at least one workout block.";
    if (file.blocks.length > 30) return "WFH workouts can have at most 30 blocks.";
    for (let i = 0; i < file.blocks.length; i += 1) {
      if (!file.blocks[i] || !Array.isArray(file.blocks[i].exercises) || !file.blocks[i].exercises.length) return `Add at least one exercise to block ${i + 1}.`;
      if (file.blocks[i].exercises.length > 40) return `Block ${i + 1} has more than 40 exercises, which is the most WFH accepts.`;
      if (file.blocks[i].exercises.some((item) => !item || typeof item !== "object" || !item.name)) return `Name every exercise in block ${i + 1}.`;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(file)).length;
    if (bytes > 512 * 1024) return "This workout is too large for WFH.";
    return "";
  }

  function fileName(title) {
    const safe = text(title, "My workout").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
    return `${safe}.kworkout`;
  }

  // Links: `z.` + base64url(raw deflate of JSON), or `j.` + base64url(JSON) where CompressionStream is missing.
  // The app reads the same payload from kworkout://import?d=… (WorkoutFile.decode(linkPayload:)).
  const maxLinkPayload = 48 * 1024;
  const toBase64URL = (bytes) => {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const fromBase64URL = (value) => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  };
  async function runStream(stream, bytes) {
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  async function encodeLink(file) {
    const bytes = new TextEncoder().encode(JSON.stringify(file));
    let payload = "";
    if (typeof CompressionStream === "function") {
      try { payload = `z.${toBase64URL(await runStream(new CompressionStream("deflate-raw"), bytes))}`; } catch (reason) { payload = ""; }
    }
    if (!payload) payload = `j.${toBase64URL(bytes)}`;
    if (payload.length > maxLinkPayload) throw new Error("This workout is too large for a link. Download the file instead.");
    return payload;
  }
  async function decodeLink(payload) {
    const text = String(payload || "").replace(/^#/, "");
    if (text.length > maxLinkPayload || !/^[zj]\.[A-Za-z0-9_-]+$/.test(text)) throw new Error("This link isn't a valid WFH workout.");
    let bytes = fromBase64URL(text.slice(2));
    if (text[0] === "z") {
      if (typeof DecompressionStream !== "function") throw new Error("This browser can't read the link. Try Safari or Chrome.");
      bytes = await runStream(new DecompressionStream("deflate-raw"), bytes);
    }
    if (bytes.length > 512 * 1024) throw new Error("This workout is too large for WFH.");
    const file = JSON.parse(new TextDecoder().decode(bytes));
    const message = validateWorkout(file);
    if (message) throw new Error(message);
    return file;
  }

  globalThis.WFHWorkoutBuilder = { buildWorkout, validateWorkout, fileName, clamp, slug, encodeLink, decodeLink };
  if (typeof document === "undefined" || !document.getElementById("workout-form")) return;

  const form = document.getElementById("workout-form");
  const blocks = document.getElementById("blocks");
  const blockTemplate = document.getElementById("block-template");
  const exerciseTemplate = document.getElementById("exercise-template");
  const preview = document.getElementById("preview");
  const totals = document.getElementById("totals");
  const error = document.getElementById("form-error");
  const shareButton = document.getElementById("share");
  const picker = document.getElementById("picker");
  const pickerList = document.getElementById("picker-list");
  const pickerSearch = document.getElementById("picker-search");
  const pickerPattern = document.getElementById("picker-pattern");
  const pickerEquipment = document.getElementById("picker-equipment");
  const pickerAdded = document.getElementById("picker-added");
  const blockKinds = ["straightSets", "superset", "intervals", "emom", "amrap", "flow", "stopwatch"];
  let pickerBlock = null;
  let pickerCount = 0;

  function describe(ex) {
    if (!ex.catalog) return "";
    const kit = ex.equipment.length ? ex.equipment.map((item) => equipmentName[item] || item).join(" + ") : "Bodyweight";
    return `${kit} · ${ex.muscles.map((item) => muscleName[item] || item).join(", ")} · ${ex.pattern}`;
  }

  function addExercise(block, seed = {}) {
    const ex = seed.exercise || { catalog: false, id: null, name: seed.name || "", equipment: [], muscles: ["fullBody"], pattern: "core", timed: false, perSide: false };
    const row = exerciseTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = uid();
    row.exercise = ex;
    row.sourceExercise = ex.source || null;
    const equipmentSelect = row.querySelector(".exercise-equipment");
    equipment.forEach(([value, label]) => equipmentSelect.add(new Option(label, value)));
    const nameInput = row.querySelector(".exercise-name");
    nameInput.value = ex.name;
    nameInput.readOnly = ex.catalog;
    row.classList.toggle("is-catalog", ex.catalog);
    row.querySelector(".exercise-value").value = seed.value || (ex.timed ? 30 : 10);
    row.querySelector(".exercise-load").value = seed.load || "";
    row.querySelector(".exercise-side").checked = Boolean(ex.perSide);
    row.querySelector(".exercise-tags").textContent = describe(ex);
    if (ex.catalog) nameInput.title = describe(ex);
    row.querySelector(".exercise-tags").hidden = !ex.catalog;
    row.querySelector(".custom-fields").hidden = ex.catalog;
    equipmentSelect.value = ex.equipment[0] || "";
    row.querySelector(".exercise-pattern").value = ex.pattern;
    row.querySelector(".exercise-body").value = bodyForExercise(ex);
    block.querySelector(".exercise-list").append(row);
    updateBlock(block);
    return row;
  }

  function addBlock(seed = {}) {
    const block = blockTemplate.content.firstElementChild.cloneNode(true);
    block.querySelector(".block-title").value = seed.title || `Block ${blocks.children.length + 1}`;
    block.dataset.tone = seed.tone || (seed.kind === "flow" ? "warmup" : "work");
    block.querySelector(".block-kind").value = seed.kind || "straightSets";
    block.querySelector(".block-rounds").value = seed.rounds || 3;
    block.querySelector(".block-work").value = seed.work || 40;
    block.querySelector(".block-rest").value = seed.rest ?? 30;
    block.querySelector(".block-cap").value = seed.cap || 10;
    blocks.append(block);
    (seed.exercises || []).forEach((item) => addExercise(block, item));
    renumber();
    return block;
  }

  function updateBlock(block) {
    const kind = block.querySelector(".block-kind").value;
    block.dataset.kind = kind;
    block.querySelector(".rounds-label").textContent = kind === "emom" ? "Minutes" : kind === "intervals" ? "Rounds" : "Sets";
    const rows = Array.from(block.querySelectorAll(".exercise-row"));
    rows.forEach((row) => {
      row.querySelector(".prescription-label").textContent = usesSeconds(row, kind) ? "Secs" : "Reps";
      row.querySelector(".value-field").hidden = kind === "intervals" || kind === "stopwatch";
    });
    block.querySelector(".block-summary").textContent = `${rows.length} ${rows.length === 1 ? "move" : "moves"} · ` + rows.map((row) => text(row.exercise.catalog ? row.exercise.name : row.querySelector(".exercise-name").value, "Exercise")).join(" · ") || "No exercises yet";
    updatePreview();
  }

  function renumber() {
    Array.from(blocks.children).forEach((block, blockIndex) => {
      block.querySelector(".drag-index").textContent = String(blockIndex + 1).padStart(2, "0");
      block.querySelector(".move-block-up").disabled = blockIndex === 0;
      block.querySelector(".move-block-down").disabled = blockIndex === blocks.children.length - 1;
      Array.from(block.querySelectorAll(".exercise-row")).forEach((row, index) => {
        row.querySelector(".exercise-number").textContent = String(index + 1).padStart(2, "0");
      });
      updateBlock(block);
    });
    updatePreview();
  }

  function currentWorkout() { return buildWorkout(form, Array.from(blocks.children)); }

  function updatePreview() {
    refreshLink();
    const toggleAll = document.getElementById("toggle-all");
    if (!blocks.children.length) {
      preview.textContent = "Add a block to start.";
      totals.textContent = "";
      toggleAll.hidden = true;
      return;
    }
    toggleAll.hidden = false;
    const file = currentWorkout();
    const moves = file.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
    const summary = `${file.blocks.length} ${file.blocks.length === 1 ? "block" : "blocks"} · ${moves} ${moves === 1 ? "move" : "moves"}`;
    totals.textContent = summary;
    preview.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = file.title;
    const detail = document.createElement("span");
    detail.textContent = `${file.minutes} min · ${summary}`;
    preview.append(title, detail);
  }

  const linkField = document.getElementById("link-field");
  const linkNote = document.getElementById("link-note");
  let linkTimer = 0;
  let linkRun = 0;

  // The link follows the form: rebuilt shortly after each edit so it can be copied at any time.
  function refreshLink() {
    clearTimeout(linkTimer);
    linkTimer = setTimeout(async () => {
      const run = ++linkRun;
      const workout = currentWorkout();
      let value = "";
      let note = "";
      if (validateWorkout(workout)) note = "Name the workout and every exercise to get a link";
      else {
        try { value = new URL(`open.html#${await encodeLink(workout)}`, location.href).href; note = `${value.length} characters`; } catch (reason) { note = reason.message; }
      }
      if (run !== linkRun) return;
      linkField.value = value;
      linkNote.textContent = note;
    }, 250);
  }

  async function currentLink() {
    const workout = makeWorkout();
    if (!workout) return "";
    return new URL(`open.html#${await encodeLink(workout)}`, location.href).href;
  }

  function makeWorkout() {
    const workout = currentWorkout();
    const message = validateWorkout(workout);
    error.hidden = !message;
    error.textContent = message;
    return message ? null : workout;
  }

  function makeFile() {
    const workout = makeWorkout();
    if (!workout) return null;
    return new File([JSON.stringify(workout, null, 2)], fileName(workout.title), { type: "application/octet-stream" });
  }

  function loadWorkout(file, sourceName) {
    const message = validateWorkout(file);
    if (message) throw new Error(message);
    form.notes = text(file.notes, "", 2000);
    form.elements.title.value = text(file.title, "My workout");
    form.elements.author.value = text(file.author);
    form.elements.minutes.value = clamp(file.minutes, 5, 180);
    form.elements.focus.value = ["fullBody", "upper", "lower", "core", "cardio", "mobility"].includes(file.focus) ? file.focus : "fullBody";
    form.elements.intensity.value = ["easy", "steady", "hard"].includes(file.intensity) ? file.intensity : "steady";
    document.getElementById("quiet").checked = Boolean(file.quiet);
    blocks.replaceChildren();
    file.blocks.slice(0, 30).forEach((block) => {
      const kind = blockKinds.includes(block.kind) ? block.kind : "flow";
      addBlock({
        title: text(block.title, "Workout"), kind,
        tone: ["warmup", "work", "cooldown"].includes(block.tone) ? block.tone : "work",
        rounds: clamp(block.rounds, 1, 30), work: clamp(block.workSeconds, 0, 600), rest: clamp(block.restSeconds, 0, 600),
        cap: Math.max(1, Math.round(clamp(block.capSeconds, 0, 3600) / 60)),
        exercises: block.exercises.slice(0, 40).map((item) => {
          const exercise = fromFile(item);
          if (Number.isFinite(item.seconds) && !Number.isFinite(item.reps)) exercise.timed = true;
          const seconds = Number.isFinite(item.seconds) && (kind === "flow" || exercise.timed);
          return { exercise, value: seconds ? clamp(item.seconds, 5, 3600) : clamp(item.reps, 1, 200), load: text(item.load) };
        })
      });
    });
    renumber();
    document.getElementById("import-status").textContent = `${sourceName} opened · ${file.blocks.length} ${file.blocks.length === 1 ? "block" : "blocks"}.`;
    document.getElementById("details-title").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Exercise picker
  equipmentChoices();
  function equipmentChoices() {
    pickerEquipment.add(new Option("Any equipment", ""));
    pickerEquipment.add(new Option("Bodyweight only", "none"));
    equipment.slice(1).forEach(([value, label]) => pickerEquipment.add(new Option(label, value)));
  }

  function renderPicker() {
    const words = pickerSearch.value.toLowerCase().split(/\s+/).filter(Boolean);
    const pattern = pickerPattern.value;
    const kit = pickerEquipment.value;
    const matches = catalog.filter((item) =>
      (!pattern || item.pattern === pattern) &&
      (!kit || (kit === "none" ? !item.needs.length : item.needs.includes(kit))) &&
      words.every((word) => item.search.includes(word)));
    const items = [];
    const custom = document.createElement("li");
    const customButton = document.createElement("button");
    customButton.type = "button";
    customButton.className = "pick custom-pick";
    customButton.dataset.custom = "1";
    const query = pickerSearch.value.trim();
    customButton.innerHTML = "<b>＋</b><span><strong></strong><small>Your own exercise, saved inside the file</small></span>";
    customButton.querySelector("strong").textContent = query ? `Add “${query.slice(0, 40)}” as custom` : "Custom exercise…";
    custom.append(customButton);
    items.push(custom);
    matches.slice(0, 80).forEach((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pick";
      button.dataset.id = item.id;
      button.innerHTML = "<b>＋</b><span><strong></strong><small></small></span>";
      button.querySelector("strong").textContent = item.name;
      button.querySelector("small").textContent = `${item.needs.length ? item.needs.map((entry) => equipmentName[entry] || entry).join(" + ") : "Bodyweight"} · ${item.muscles.map((entry) => muscleName[entry] || entry).join(", ")}${item.timed ? " · timed" : ""}`;
      li.append(button);
      items.push(li);
    });
    if (matches.length > 80) {
      const more = document.createElement("li");
      more.className = "pick-more muted";
      more.textContent = `${matches.length - 80} more · refine the search`;
      items.push(more);
    } else if (!matches.length) {
      const none = document.createElement("li");
      none.className = "pick-more muted";
      none.textContent = "No match in the list. Add it as a custom exercise.";
      items.push(none);
    }
    pickerList.replaceChildren(...items);
  }

  function openPicker(block) {
    pickerBlock = block;
    pickerCount = 0;
    pickerAdded.textContent = "";
    document.getElementById("picker-title").textContent = `Add to ${text(block.querySelector(".block-title").value, "block")}`;
    renderPicker();
    if (picker.showModal) picker.showModal(); else picker.setAttribute("open", "");
    pickerList.scrollTop = 0;
    pickerSearch.focus();
  }

  function closePicker() {
    if (picker.close) picker.close(); else picker.removeAttribute("open");
    pickerBlock = null;
  }

  pickerSearch.addEventListener("input", renderPicker);
  pickerPattern.addEventListener("change", renderPicker);
  pickerEquipment.addEventListener("change", renderPicker);
  document.getElementById("picker-done").addEventListener("click", closePicker);
  picker.addEventListener("click", (event) => { if (event.target === picker) closePicker(); });
  pickerList.addEventListener("click", (event) => {
    const button = event.target.closest(".pick");
    if (!button || !pickerBlock) return;
    if (button.dataset.custom) {
      const row = addExercise(pickerBlock, { name: pickerSearch.value.trim().slice(0, 80) });
      closePicker();
      row.querySelector(".exercise-name").focus();
      return;
    }
    const entry = catalogByID.get(button.dataset.id);
    if (!entry) return;
    addExercise(pickerBlock, { exercise: fromCatalog(entry) });
    renumber();
    pickerCount += 1;
    pickerAdded.textContent = `${pickerCount} added`;
    button.classList.add("picked");
    setTimeout(() => button.classList.remove("picked"), 600);
  });

  // Blocks and rows
  function move(element, direction) {
    const sibling = direction < 0 ? element.previousElementSibling : element.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) sibling.before(element); else sibling.after(element);
    renumber();
  }

  function setCollapsed(block, collapsed) {
    block.classList.toggle("collapsed", collapsed);
    const button = block.querySelector(".collapse-block");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Expand block" : "Collapse block");
  }

  blocks.addEventListener("click", (event) => {
    const block = event.target.closest(".workout-block");
    if (!block) return;
    const row = event.target.closest(".exercise-row");
    if (event.target.closest(".add-exercise")) openPicker(block);
    else if (event.target.closest(".collapse-block")) setCollapsed(block, !block.classList.contains("collapsed"));
    else if (event.target.closest(".move-block-up")) move(block, -1);
    else if (event.target.closest(".move-block-down")) move(block, 1);
    else if (event.target.closest(".remove-block")) { block.remove(); renumber(); }
    else if (row && event.target.closest(".remove-exercise")) { row.remove(); renumber(); }
    else if (row && event.target.closest(".move-up")) move(row, -1);
    else if (row && event.target.closest(".move-down")) move(row, 1);
    else if (row && event.target.closest(".more-exercise")) {
      const panel = row.querySelector(".exercise-more");
      panel.hidden = !panel.hidden;
      row.classList.toggle("open", !panel.hidden);
      event.target.closest(".more-exercise").setAttribute("aria-expanded", String(!panel.hidden));
    }
  });
  document.getElementById("toggle-all").addEventListener("click", (event) => {
    const all = Array.from(blocks.children);
    const collapse = all.some((block) => !block.classList.contains("collapsed"));
    all.forEach((block) => setCollapsed(block, collapse));
    event.currentTarget.textContent = collapse ? "Expand all" : "Collapse all";
  });
  function editedRow(event) {
    const row = event.target.closest(".exercise-row");
    if (!row || row.exercise.catalog) return;
    const ex = row.exercise;
    if (event.target.matches(".exercise-name")) ex.name = event.target.value;
    if (event.target.matches(".exercise-equipment")) ex.equipment = event.target.value ? [event.target.value] : [];
    if (event.target.matches(".exercise-pattern")) ex.pattern = event.target.value;
    if (event.target.matches(".exercise-body")) { ex.muscles = muscles[event.target.value] || ["fullBody"]; ex.bodyParts = [event.target.value]; }
  }
  function onEdit(event) {
    editedRow(event);
    const block = event.target.closest(".workout-block");
    if (block) updateBlock(block); else updatePreview();
  }
  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const file = makeFile();
    if (file) downloadFile(file);
  });
  document.getElementById("add-block").addEventListener("click", () => {
    const block = addBlock({ title: `Block ${blocks.children.length + 1}` });
    block.scrollIntoView({ behavior: "smooth", block: "center" });
    openPicker(block);
  });
  document.getElementById("file-input").addEventListener("change", async (event) => {
    const selected = event.target.files[0];
    if (!selected) return;
    const status = document.getElementById("import-status");
    try {
      if (selected.size > 512 * 1024) throw new Error("This file is too large for WFH.");
      loadWorkout(JSON.parse(await selected.text()), selected.name);
      error.hidden = true;
    } catch (reason) {
      status.textContent = "";
      error.hidden = false;
      error.textContent = reason instanceof Error ? reason.message : "This isn't a valid WFH workout file.";
    } finally {
      event.target.value = "";
    }
  });
  async function copyText(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch (reason) {
      linkField.focus();
      linkField.select();
      try { return document.execCommand("copy"); } catch (failure) { return false; }
    }
  }

  document.getElementById("copy-link").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const link = await currentLink();
    if (!link) return;
    linkField.value = link;
    button.textContent = (await copyText(link)) ? "Copied ✓" : "Select and copy";
    setTimeout(() => { button.textContent = "Copy"; }, 1800);
  });
  linkField.addEventListener("focus", () => linkField.select());

  shareButton.addEventListener("click", async () => {
    let link;
    try { link = await currentLink(); } catch (reason) {
      error.hidden = false;
      error.textContent = reason.message;
      return;
    }
    if (!link) return;
    if (navigator.share) {
      try { await navigator.share({ title: currentWorkout().title, text: "Open this workout in WFH", url: link }); return; } catch (reason) {
        if (reason.name === "AbortError") return;
      }
    }
    linkField.value = link;
    error.hidden = false;
    error.textContent = (await copyText(link)) ? "Link copied. Paste it into a message: tapping it shows an Open in WFH button." : "Copy the link from the Share link field above.";
  });

  // A starting point: warm-up, strength. IDs that the list doesn't have fall back to a custom row.
  const pick = (id, extra = {}) => ({ exercise: catalogByID.has(id) ? fromCatalog(catalogByID.get(id)) : undefined, ...extra });
  addBlock({ title: "Warm-up", kind: "flow", tone: "warmup", exercises: [pick("joint-circles", { value: 40 }), pick("cat-cow", { value: 40 })] });
  addBlock({ title: "Strength", kind: "straightSets", rounds: 3, rest: 60, exercises: [
    pick("db-goblet-squat", { load: "12 kg" }), pick("push-up"), pick("db-one-arm-row", { load: "12 kg" })
  ] });

  // Opened from a shared link ("Edit in builder" on open.html).
  if (/^#[zj]\./.test(location.hash)) {
    decodeLink(location.hash).then((file) => loadWorkout(file, "Shared link")).catch((reason) => {
      error.hidden = false;
      error.textContent = reason.message;
    });
  }
}());
