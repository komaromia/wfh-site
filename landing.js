(function () {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Scroll progress bar, nav border, active section link
  const bar = $(".scroll-bar");
  const nav = $(".l-nav");
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    nav.classList.toggle("scrolled", scrollY > 8);
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const links = $$(".l-nav nav a");
  const sections = links.map((link) => $(link.getAttribute("href"))).filter(Boolean);
  if ("IntersectionObserver" in window) {
    const active = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((section) => active.observe(section));

    // Reveal on scroll
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        reveal.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((element) => reveal.observe(element));

    // Count-up numbers
    const counter = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counter.unobserve(entry.target);
        countUp(entry.target);
      });
    }, { threshold: 0.6 });
    $$("[data-count]").forEach((element) => counter.observe(element));
  } else {
    $$(".reveal").forEach((element) => element.classList.add("in"));
  }

  function countUp(element) {
    const target = Number(element.dataset.count);
    const suffix = element.dataset.suffix || "";
    if (reduced || target === 0) { element.textContent = `${target}${suffix}`; return; }
    const start = performance.now();
    const duration = 1200;
    (function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      element.textContent = `${Math.round(target * (1 - Math.pow(1 - t, 3)))}${suffix}`;
      if (t < 1) requestAnimationFrame(frame);
    }(start));
  }

  // Hero carousel + pointer tilt
  const carousel = $("[data-carousel]");
  if (carousel) {
    const slides = $$(".slide", carousel);
    const dots = $$(".carousel-dots button");
    const caption = $(".carousel-caption");
    const captions = ["Today's workout, one tap away", "Preview every block before you start", "Count sets and reps hands-free", "Big, bold interval timers"];
    let index = 0;
    let timer = 0;
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle("on", i === index));
      dots.forEach((dot, i) => dot.setAttribute("aria-selected", String(i === index)));
      caption.textContent = captions[index];
    }
    function play() { clearInterval(timer); if (!reduced) timer = setInterval(() => show(index + 1), 3800); }
    dots.forEach((dot, i) => dot.addEventListener("click", () => { show(i); play(); }));
    const stage = $(".hero-stage");
    stage.addEventListener("pointerenter", () => clearInterval(timer));
    stage.addEventListener("pointerleave", () => { play(); carousel.style.transform = ""; });
    document.addEventListener("visibilitychange", () => (document.hidden ? clearInterval(timer) : play()));
    stage.addEventListener("pointermove", (event) => {
      if (reduced || event.pointerType === "touch") return;
      const box = carousel.getBoundingClientRect();
      const x = (event.clientX - (box.left + box.width / 2)) / box.width;
      const y = (event.clientY - (box.top + box.height / 2)) / box.height;
      carousel.classList.add("dragging");
      carousel.style.transform = `rotateY(${x * 16}deg) rotateX(${-y * 10}deg)`;
    });
    stage.addEventListener("pointerleave", () => carousel.classList.remove("dragging"));
    play();
  }

  // Tabs that swap the phone screenshot, auto-advancing until the visitor takes over
  $$("[data-tabs]").forEach((list) => {
    const phone = document.getElementById(list.dataset.tabs);
    const screen = $(".phone-screen", phone);
    const tabs = $$("[role=tab]", list);
    let current = 0;
    let timer = 0;
    let manual = false;
    function select(next) {
      current = (next + tabs.length) % tabs.length;
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === current));
        tab.classList.remove("timing");
      });
      const tab = tabs[current];
      const image = new Image();
      image.className = "slide";
      image.src = tab.dataset.img;
      image.alt = tab.dataset.alt;
      image.width = 560;
      image.height = 1217;
      screen.append(image);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        image.classList.add("on");
        $$(".slide.on", screen).forEach((old) => { if (old !== image) old.classList.remove("on"); });
        setTimeout(() => $$(".slide:not(.on)", screen).forEach((old) => old.remove()), 700);
      }));
      if (!manual && !reduced) requestAnimationFrame(() => requestAnimationFrame(() => tab.classList.add("timing")));
    }
    function schedule() {
      clearTimeout(timer);
      if (manual || reduced) return;
      timer = setTimeout(() => { select(current + 1); schedule(); }, 5200);
    }
    tabs.forEach((tab, i) => tab.addEventListener("click", () => { manual = true; clearTimeout(timer); select(i); }));
    if (!reduced && "IntersectionObserver" in window) {
      new IntersectionObserver((entries, observer) => {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        tabs[current].classList.add("timing");
        schedule();
      }, { threshold: 0.5 }).observe(list);
    }
  });

  // "Try it": a small generator over the app's real exercise list
  const result = $("#demo-result");
  const catalog = (globalThis.WFH_CATALOG || []).map(([id, name, needs, muscles, pattern, unilateral, timed, impact]) => ({ id, name, needs, muscles, pattern, unilateral: Boolean(unilateral), timed: Boolean(timed), impact: Boolean(impact) }));
  if (result && catalog.length) {
    const kit = new Set(["dumbbells"]);
    let minutes = 30;
    let seed = 7;
    let lastFile = null;

    function random() { // mulberry32
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const shuffle = (list) => list.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
    const allowed = (item) => item.needs.every((need) => kit.has(need));

    function generate() {
      seed = seed0;
      const usable = catalog.filter((item) => allowed(item) && !item.impact);
      const used = new Set();
      const take = (predicate, preferKit) => {
        const open = usable.filter((item) => !used.has(item.id) && predicate(item));
        // Hand-written app exercises first; the imported list fills in when the kit is thin.
        const curated = open.filter((item) => !item.id.startsWith("fedb-"));
        const pool = shuffle(curated.length ? curated : open);
        const preferred = preferKit ? pool.filter((item) => item.needs.length) : [];
        const choice = (preferred.length && random() < 0.75 ? preferred : pool)[0];
        if (choice) used.add(choice.id);
        return choice;
      };
      const warm = [take((item) => item.timed && item.pattern === "mobility"), take((item) => item.timed && item.pattern === "cardio" || item.timed && item.pattern === "mobility")].filter(Boolean);
      const count = Math.max(2, Math.min(10, Math.round((minutes - 5) / 3.5)));
      const order = ["squat", "push", "hinge", "pull", "lunge", "core", "push", "pull", "squat", "core"];
      const main = [];
      for (let i = 0; i < count; i += 1) {
        const pick = take((item) => !item.timed && item.pattern === order[i], true) || take((item) => !item.timed && ["squat", "push", "hinge", "pull", "lunge", "core"].includes(item.pattern), true);
        if (pick) main.push(pick);
      }
      const cool = [take((item) => item.timed && item.pattern === "mobility"), take((item) => item.timed && item.pattern === "mobility")].filter(Boolean);
      return { warm, main, cool };
    }

    let seed0 = 7;
    const spec = (item, mode) => {
      if (mode === "timed") return "40 s";
      const reps = 8 + Math.floor(random() * 5);
      return item.unilateral ? `${reps} / side` : `${reps} reps`;
    };

    function render() {
      const { warm, main, cool } = generate();
      const groups = [];
      const total = (list) => list.length;
      if (total(warm)) groups.push({ title: "Warm-up", meta: "timed", tone: "rest", kind: "flow", rounds: 1, rest: 0, items: warm.map((item) => ({ item, text: "40 s", seconds: 40 })) });
      for (let i = 0; i < main.length; i += 4) {
        const part = main.slice(i, i + 4);
        groups.push({ title: main.length > 4 ? `Strength ${String.fromCharCode(65 + i / 4)}` : "Strength", meta: "3 sets · 60 s rest", tone: "work", kind: "straightSets", rounds: 3, rest: 60,
          items: part.map((item) => { const text = spec(item, "reps"); return { item, text, reps: parseInt(text, 10) }; }) });
      }
      if (total(cool)) groups.push({ title: "Cool-down", meta: "timed", tone: "rest", kind: "flow", rounds: 1, rest: 0, items: cool.map((item) => ({ item, text: "40 s", seconds: 40 })) });
      result.replaceChildren();
      let delay = 0;
      groups.forEach((group) => {
        const block = document.createElement("section");
        block.className = `demo-block ${group.tone === "rest" ? "rest" : ""}`;
        const head = document.createElement("h3");
        head.textContent = group.title;
        const meta = document.createElement("small");
        meta.textContent = group.meta;
        head.append(meta);
        const list = document.createElement("ul");
        group.items.forEach(({ item, text }) => {
          const li = document.createElement("li");
          li.style.setProperty("--d", `${(delay += 0.05).toFixed(2)}s`);
          const name = document.createElement("span");
          name.textContent = item.name;
          const detail = document.createElement("span");
          detail.textContent = text;
          li.append(name, detail);
          list.append(li);
        });
        block.append(head, list);
        result.append(block);
      });
      lastFile = {
        schemaVersion: 1, app: "KWorkout", title: "Quick session", minutes, focus: "fullBody", format: "auto", intensity: "steady", quiet: false,
        blocks: groups.map((group) => ({
          kind: group.kind, title: group.title, rounds: group.rounds, workSeconds: 0, restSeconds: group.rest, capSeconds: 0, tone: group.tone === "rest" ? (group.title === "Warm-up" ? "warmup" : "cooldown") : "work",
          exercises: group.items.map(({ item, reps, seconds }) => {
            const entry = { id: item.id, name: item.name, equipment: item.needs, muscles: item.muscles, pattern: item.pattern, perSide: item.unilateral };
            if (seconds) entry.seconds = seconds; else entry.reps = reps;
            return entry;
          })
        }))
      };
    }

    const builderLink = $("#demo-builder");
    builderLink.addEventListener("click", async (event) => {
      if (!lastFile || !globalThis.WFHWorkoutBuilder) return;
      event.preventDefault();
      try { location.href = `builder.html#${await WFHWorkoutBuilder.encodeLink(lastFile)}`; } catch (reason) { location.href = "builder.html"; }
    });
    $$("#demo-kit .chip").forEach((chip) => chip.addEventListener("click", () => {
      const key = chip.dataset.kit;
      if (kit.has(key)) kit.delete(key); else kit.add(key);
      chip.setAttribute("aria-pressed", String(kit.has(key)));
      render();
    }));
    const slider = $("#demo-minutes");
    slider.addEventListener("input", () => {
      minutes = Number(slider.value);
      $("#demo-minutes-out").textContent = `${minutes} min`;
      render();
    });
    $("#demo-shuffle").addEventListener("click", () => { seed0 = (seed0 * 31 + 17) % 100000; render(); });
    render();
  }
}());
