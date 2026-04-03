(() => {
  const $ = (id) => document.getElementById(id);

  const appEl = $("app");
  const yearEl = $("year");

  const screenStart = $("screenStart");
  const screenQuestion = $("screenQuestion");
  const screenResult = $("screenResult");
  const screenFinal = $("screenFinal");

  const btnStart = $("btnStart");
  const btnShuffle = $("btnShuffle");
  const btnResetTop = $("btnResetTop");

  const metaTotal = $("metaTotal");

  const statusText = $("statusText");
  const progressBar = $("progressBar");
  const scoreValue = $("scoreValue");

  const questionText = $("questionText");
  const questionSub = $("questionSub");
  const btnA = $("btnA");
  const btnB = $("btnB");
  const btnAText = $("btnAText");
  const btnBText = $("btnBText");

  const resultBox = $("resultBox");
  const resultBadge = $("resultBadge");
  const resultTitle = $("resultTitle");
  const resultText = $("resultText");
  const resultMeta = $("resultMeta");
  const btnNext = $("btnNext");
  const btnToStart = $("btnToStart");

  const finalScore = $("finalScore");
  const finalTitle = $("finalTitle");
  const finalText = $("finalText");
  const btnRestart = $("btnRestart");
  const btnShare = $("btnShare");

  const QUESTIONS_SOURCE = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];

  const state = {
    questions: [],
    idx: 0,
    score: 0,
    answered: false
  };

  function showScreen(screenEl) {
    [screenStart, screenQuestion, screenResult, screenFinal].forEach((el) => {
      el.classList.remove("screen--active");
    });
    screenEl.classList.add("screen--active");
  }

  function setTheme(mode) {
    document.body.classList.remove("state-ok", "state-bad");
    if (mode === "ok") document.body.classList.add("state-ok");
    if (mode === "bad") document.body.classList.add("state-bad");
  }

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clampQuestions(qs) {
    return qs
      .filter((q) => q && typeof q.prompt === "string")
      .map((q, i) => {
        const correct = (q.correct || "").toString().toUpperCase() === "B" ? "B" : "A";
        return {
          id: q.id || `q${i + 1}`,
          prompt: q.prompt,
          a: q.a ?? "Вариант A",
          b: q.b ?? "Вариант B",
          correct,
          explanation: q.explanation ?? "Нет объяснения."
        };
      });
  }

  function initQuestions({ doShuffle } = { doShuffle: false }) {
    const normalized = clampQuestions(QUESTIONS_SOURCE);
    state.questions = doShuffle ? shuffle(normalized) : normalized;
    state.idx = 0;
    state.score = 0;
    state.answered = false;

    metaTotal.textContent = String(state.questions.length || 0);
    $("metaTotal").textContent = String(state.questions.length || 0);
  }

  function updateTopUI() {
    scoreValue.textContent = String(state.score);
  }

  function updateProgress() {
    const total = state.questions.length || 1;
    const current = Math.min(state.idx + 1, total);
    const pct = Math.round(((current - 1) / total) * 100);
    progressBar.style.width = `${pct}%`;
    statusText.textContent = `Вопрос ${current} из ${total}`;
  }

  function renderQuestion() {
    setTheme("neutral");
    state.answered = false;

    const q = state.questions[state.idx];
    if (!q) {
      showFinal();
      return;
    }

    questionText.textContent = q.prompt;
    questionSub.textContent = "Выбери вариант";
    btnAText.textContent = q.a;
    btnBText.textContent = q.b;

    btnA.disabled = false;
    btnB.disabled = false;

    updateProgress();
    updateTopUI();

    showScreen(screenQuestion);
  }

  function lockAnswers() {
    btnA.disabled = true;
    btnB.disabled = true;
  }

  function answer(choice) {
    if (state.answered) return;
    state.answered = true;

    const q = state.questions[state.idx];
    const selected = choice.toUpperCase() === "B" ? "B" : "A";
    const isCorrect = selected === q.correct;

    lockAnswers();

    if (isCorrect) state.score += 1;

    const total = state.questions.length;
    const current = state.idx + 1;

    resultMeta.textContent = `Вопрос ${current} из ${total}`;

    resultText.textContent = q.explanation;

    if (isCorrect) {
      setTheme("ok");
      resultBadge.textContent = "Правильно";
      resultTitle.textContent = "Отлично!";
      resultBox.style.background = "rgba(55, 214, 122, 0.10)";
      resultBox.style.borderColor = "rgba(55, 214, 122, 0.32)";
    } else {
      setTheme("bad");
      resultBadge.textContent = "Неправильно";
      resultTitle.textContent = "Не страшно — дальше будет лучше.";
      resultBox.style.background = "rgba(255, 65, 108, 0.10)";
      resultBox.style.borderColor = "rgba(255, 65, 108, 0.34)";
    }

    updateTopUI();
    showScreen(screenResult);
  }

  function next() {
    state.idx += 1;
    if (state.idx >= state.questions.length) {
      showFinal();
    } else {
      renderQuestion();
    }
  }

  function getFinalMessage(score, total) {
    const pct = total ? Math.round((score / total) * 100) : 0;
    if (pct >= 90) return "Супер! Ты настоящий историк (и немного волшебник).";
    if (pct >= 70) return "Очень хорошо! Уверенная победа.";
    if (pct >= 50) return "Неплохо! Есть над чем подтянуться — но ты на верном пути.";
    return "Это только начало. Перезапусти и возьми реванш!";
  }

  function showFinal() {
    setTheme("neutral");
    const total = state.questions.length || 0;
    finalScore.textContent = `${state.score}/${total}`;

    finalTitle.textContent = "Готово!";
    finalText.textContent = getFinalMessage(state.score, total);

    progressBar.style.width = "100%";
    statusText.textContent = `Вопрос ${total} из ${total}`;
    updateTopUI();

    showScreen(screenFinal);
  }

  function goStart() {
    setTheme("neutral");
    showScreen(screenStart);
  }

  function restart({ doShuffle } = { doShuffle: false }) {
    initQuestions({ doShuffle });
    renderQuestion();
  }

  function copyResult() {
    const total = state.questions.length || 0;
    const text = `Мой результат в “Мир или Правда”: ${state.score}/${total}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        btnShare.textContent = "Скопировано!";
        setTimeout(() => (btnShare.textContent = "Скопировать результат"), 1200);
      });
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      btnShare.textContent = "Скопировано!";
      setTimeout(() => (btnShare.textContent = "Скопировать результат"), 1200);
    }
  }

  btnStart.addEventListener("click", () => restart({ doShuffle: false }));
  btnShuffle.addEventListener("click", () => restart({ doShuffle: true }));
  btnResetTop.addEventListener("click", () => goStart());

  btnA.addEventListener("click", () => answer("A"));
  btnB.addEventListener("click", () => answer("B"));

  btnNext.addEventListener("click", () => next());
  btnToStart.addEventListener("click", () => goStart());

  btnRestart.addEventListener("click", () => restart({ doShuffle: true }));
  btnShare.addEventListener("click", () => copyResult());

  window.addEventListener("keydown", (e) => {
    const activeStart = screenStart.classList.contains("screen--active");
    const activeQuestion = screenQuestion.classList.contains("screen--active");
    const activeResult = screenResult.classList.contains("screen--active");
    const activeFinal = screenFinal.classList.contains("screen--active");

    if (activeStart && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      restart({ doShuffle: false });
      return;
    }

    if (activeQuestion) {
      if (e.key.toLowerCase() === "a") answer("A");
      if (e.key.toLowerCase() === "b") answer("B");
      return;
    }

    if (activeResult && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      next();
      return;
    }

    if (activeFinal && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      restart({ doShuffle: true });
      return;
    }
  });

  yearEl.textContent = String(new Date().getFullYear());
  initQuestions({ doShuffle: false });
  metaTotal.textContent = String(state.questions.length || 0);
  showScreen(screenStart);
})();