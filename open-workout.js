(function () {
  "use strict";
  if (!document.getElementById("w-blocks")) return;

  const focusName = { fullBody: "Full body", upper: "Upper", lower: "Lower", core: "Core", cardio: "Cardio", mobility: "Mobility" };

  function describeBlock(block) {
    switch (block.kind) {
      case "straightSets": case "superset": return `${block.rounds} sets${block.restSeconds ? ` · ${block.restSeconds} s rest` : ""}`;
      case "intervals": return `${block.rounds} rounds · ${block.workSeconds} s on / ${block.restSeconds} s off`;
      case "emom": return `Every minute for ${block.rounds} min`;
      case "amrap": return `As many rounds as possible in ${Math.round(block.capSeconds / 60)} min`;
      case "flow": return "Timed flow";
      default: return "Open stopwatch";
    }
  }

  function describeExercise(block, item) {
    const parts = [];
    if (block.kind !== "intervals" && block.kind !== "stopwatch") {
      if (Number.isFinite(item.seconds) && !Number.isFinite(item.reps)) parts.push(`${item.seconds} s`);
      else if (Number.isFinite(item.reps)) parts.push(item.perSide ? `${item.reps} / side` : `${item.reps} reps`);
    }
    if (item.load) parts.push(item.load);
    return parts.join(" · ");
  }

  function render(file, payload) {
    document.getElementById("w-title").textContent = file.title;
    const moves = file.blocks.reduce((sum, block) => sum + block.exercises.length, 0);
    const meta = [file.author ? `by ${file.author}` : "", `${file.minutes} min`, focusName[file.focus] || "", `${moves} moves`].filter(Boolean);
    document.getElementById("w-meta").textContent = meta.join(" · ");
    document.getElementById("open-app").href = `kworkout://import?d=${payload}`;
    document.getElementById("edit-link").href = `builder.html#${payload}`;
    const bytes = JSON.stringify(file, null, 2);
    const download = document.getElementById("download");
    download.href = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    download.download = WFHWorkoutBuilder.fileName(file.title);
    const container = document.getElementById("w-blocks");
    file.blocks.forEach((block) => {
      const card = document.createElement("article");
      card.className = "open-block";
      const head = document.createElement("h2");
      head.textContent = block.title;
      const kind = document.createElement("span");
      kind.textContent = describeBlock(block);
      head.append(kind);
      const list = document.createElement("ul");
      block.exercises.forEach((item) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = item.name;
        const spec = document.createElement("span");
        spec.textContent = describeExercise(block, item);
        li.append(name, spec);
        list.append(li);
      });
      card.append(head, list);
      container.append(card);
    });
    document.getElementById("workout").hidden = false;
    document.title = `${file.title} – WFH`;
  }

  const payload = location.hash.replace(/^#/, "");
  WFHWorkoutBuilder.decodeLink(payload).then((file) => render(file, payload)).catch((reason) => {
    const error = document.getElementById("open-error");
    error.textContent = reason instanceof Error ? reason.message : "This link isn't a valid WFH workout.";
    error.hidden = false;
  }).finally(() => { document.getElementById("loading").hidden = true; });
}());
