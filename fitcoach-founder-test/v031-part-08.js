function renderActiveWorkout(data) {
  const workout = data.activeWorkout;
  const allSets = workout.exercises.flatMap(exercise => exercise.sets);
  const completed = allSets.filter(set => set.done).length;
  const total = allSets.length;
  $("#view").innerHTML = `
    <div class="stack">
      <article class="card workout-active">
        <div class="summary"><div><div class="kicker">WORKOUT IN PROGRESS</div><h3>${workout.planLabel}</h3><p>${completed}/${total} sets complete · started ${fmtTime(workout.startedAt)}</p></div><span class="duration">${Math.max(0,Math.round((Date.now()-new Date(workout.startedAt).getTime())/60000))} min</span></div>
        <div id="rest-panel" class="rest" ${app.restInterval ? "" : "hidden"}><span>Rest timer <b id="rest-count">90s</b></span><button data-rest-stop>Stop</button></div>
      </article>
      ${workout.exercises.map((exercise, exerciseIndex) => `
        <article class="card">
          <div class="row-head"><div><div class="kicker">EXERCISE ${exerciseIndex + 1}</div><h3>${exercise.name}</h3></div><button class="link" data-swap-exercise="${exerciseIndex}">Swap</button></div>
          <table class="set-table"><thead><tr><th>Set</th><th>${data.settings.units}</th><th>Reps</th><th>Done</th></tr></thead><tbody>
          ${exercise.sets.map((set,setIndex) => `<tr><td><span class="set-num">${setIndex + 1}</span></td><td><input inputmode="decimal" data-set-field="weight" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${set.weight}"></td><td><input inputmode="numeric" data-set-field="reps" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" value="${set.reps}"></td><td><button class="set-done ${set.done ? "done" : ""}" data-toggle-set data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="Mark set complete"></button></td></tr>`).join("")}
          </tbody></table>
        </article>`).join("")}
      <div class="finish-row"><button class="button button-ghost" data-cancel-workout>Cancel</button><button class="button button-primary" data-finish-workout>Finish workout</button></div>
    </div>`;
}

function toggleSet(exerciseIndex, setIndex) {
  const data = load();
  const set = data.activeWorkout?.exercises?.[exerciseIndex]?.sets?.[setIndex];
  if (!set) return;
  set.done = !set.done;
  save(data);
  if (set.done) startRestTimer(90);
  render();
}

function startRestTimer(seconds) {
  clearInterval(app.restInterval);
  let remaining = seconds;
  app.restInterval = setInterval(() => {
    remaining -= 1;
    const node = $("#rest-count");
    if (node) node.textContent = `${Math.max(0, remaining)}s`;
    if (remaining <= 0) {
      clearInterval(app.restInterval);
      app.restInterval = null;
      toast("Rest complete. Next set is yours.");
      if (app.route === "train") render();
    }
  }, 1000);
}

function finishWorkout() {
  const data = load();
  const workout = data.activeWorkout;
  if (!workout) return;
  const completedSets = workout.exercises.flatMap(exercise => exercise.sets.filter(set => set.done));
  if (!completedSets.length) {
    toast("Complete at least one set before finishing.");
    return;
  }
  const completedAt = new Date().toISOString();
  const session = {
    id: workout.id,
    date: todayISO(),
    completedAt,
    planId: workout.planId,
    planLabel: workout.planLabel,
    durationMinutes: Math.max(1, Math.round((Date.now() - new Date(workout.startedAt).getTime()) / 60000)),
    exercises: workout.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.filter(set => set.done) })).filter(exercise => exercise.sets.length),
    markedPR: detectPR(data, workout)
  };
  data.sessions.push(session);
  data.activeWorkout = null;
  data.decisions = data.decisions.filter(decision => decision.date !== todayISO());
  save(data);
  clearInterval(app.restInterval);
  app.restInterval = null;
  toast("Workout saved. Nova will use it next time.");
  app.route = "progress";
  render();
}

function detectPR(data, workout) {
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets.filter(item => item.done)) {
      const prior = previousWeight(data, exercise.name);
      if (prior && Number(set.weight) > prior) return true;
    }
  }
  return false;
}

function cancelWorkout() {
  openSheet(`
    <h2>End this workout?</h2>
    <p>Your completed sets have not been saved as a session yet.</p>
    <div class="hero-actions"><button class="button button-ghost" data-close-sheet>Keep training</button><button class="button button-primary" data-confirm-cancel>End workout</button></div>`);
}

