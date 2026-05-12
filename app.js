(() => {
    const $ = (id) => document.getElementById(id);

    const screens = {
        start: $("screenStart"),
        create: $("screenCreate"),
        join: $("screenJoin"),
        question: $("screenQuestion"),
        result: $("screenResult"),
        final: $("screenFinal")
    };

    const btnStart = $("btnStart");
    const btnShuffle = $("btnShuffle");
    const btnOpenCreate = $("btnOpenCreate");
    const btnResetTop = $("btnResetTop");
    const btnBackFromCreate = $("btnBackFromCreate");
    const btnCreateGame = $("btnCreateGame");
    const btnStartHost = $("btnStartHost");
    const btnCopyLink = $("btnCopyLink");
    const btnJoinGame = $("btnJoinGame");
    const btnJoinBack = $("btnJoinBack");

    const metaTotal = $("metaTotal");
    const metaCategories = $("metaCategories");
    const categoryList = $("categoryList");
    const createCategories = $("createCategories");
    const questionLimit = $("questionLimit");
    const gameTitle = $("gameTitle");
    const hostName = $("hostName");
    const createStatus = $("createStatus");
    const sharePanel = $("sharePanel");
    const shareLink = $("shareLink");
    const shareHint = $("shareHint");
    const qrImage = $("qrImage");
    const importNotice = $("importNotice");

    const joinTitle = $("joinTitle");
    const joinSummary = $("joinSummary");
    const playerName = $("playerName");
    const joinLeaderboard = $("joinLeaderboard");

    const statusText = $("statusText");
    const progressBar = $("progressBar");
    const scoreValue = $("scoreValue");
    const questionCategory = $("questionCategory");
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
    const resultSources = $("resultSources");
    const resultSourcesList = $("resultSourcesList");
    const resultMeta = $("resultMeta");
    const btnNext = $("btnNext");
    const btnToStart = $("btnToStart");

    const finalScore = $("finalScore");
    const finalTitle = $("finalTitle");
    const finalText = $("finalText");
    const btnRestart = $("btnRestart");
    const btnShare = $("btnShare");
    const btnFinalHome = $("btnFinalHome");
    const leaderboardBox = $("leaderboardBox");

    const STORAGE_KEY = "myth-truth-leaderboards-v1";
    const PLAYER_KEY = "myth-truth-player-name";
    const QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/";

    const rawCategories = Array.isArray(window.QUESTION_CATEGORIES) ? window.QUESTION_CATEGORIES : [];
    const fallbackQuestions = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
    const categories = normalizeCategories(rawCategories, fallbackQuestions);
    const questionsById = new Map(
        categories.flatMap((category) => category.questions.map((question) => [question.id, question]))
    );

    const state = {
        questions: [],
        idx: 0,
        score: 0,
        answered: false,
        mode: "solo",
        currentGame: null,
        pendingGame: null,
        playerName: "Игрок",
        startedAt: 0,
        resultSaved: false,
        lastScoreRecord: null,
        lastSoloCategory: "all",
        answerSlots: {A: "A", B: "B"},
        liveScores: new Map()
    };

    let generatedGame = null;
    let liveSource = null;

    function normalizeCategories(source, fallback) {
        const prepared = source
            .filter((category) => category && category.id && Array.isArray(category.questions))
            .map((category) => ({
                id: String(category.id),
                title: category.title || "Категория",
                description: category.description || "",
                questions: clampQuestions(category.questions, category)
            }))
            .filter((category) => category.questions.length > 0);

        if (prepared.length > 0) return prepared;

        return [
            {
                id: "default",
                title: "Все вопросы",
                description: "Базовая игра",
                questions: clampQuestions(fallback, {id: "default", title: "Все вопросы"})
            }
        ];
    }

    function normalizeSources(rawSources) {
        if (!Array.isArray(rawSources)) return [];

        return rawSources
            .map((item) => {
                if (!item) return null;

                if (typeof item === "string") {
                    const url = item.trim();
                    return url ? {title: url, url} : null;
                }

                if (typeof item !== "object") return null;

                const url = (
                    typeof item.url === "string"
                        ? item.url
                        : typeof item.link === "string"
                            ? item.link
                            : ""
                ).trim();
                if (!url) return null;

                const title = (
                    typeof item.title === "string"
                        ? item.title
                        : typeof item.name === "string"
                            ? item.name
                            : ""
                ).trim();

                return {title: title || url, url};
            })
            .filter(Boolean)
            .filter((item) => {
                try {
                    const parsed = new URL(item.url);
                    return parsed.protocol === "http:" || parsed.protocol === "https:";
                } catch (error) {
                    return false;
                }
            });
    }

    function clampQuestions(questions, category) {
        return questions
            .filter((q) => q && typeof q.prompt === "string")
            .map((q, i) => {
                const correct = String(q.correct || "").toUpperCase() === "B" ? "B" : "A";
                return {
                    id: q.id || `${category.id}-${i + 1}`,
                    prompt: q.prompt,
                    a: q.a ?? "Вариант A",
                    b: q.b ?? "Вариант B",
                    correct,
                    explanation: q.explanation ?? "Нет объяснения.",
                    sources: normalizeSources(q.sources),
                    categoryId: q.categoryId || category.id,
                    categoryTitle: q.categoryTitle || category.title
                };
            });
    }

    function showScreen(name) {
        Object.values(screens).forEach((el) => {
            if (el) el.classList.remove("screen--active");
        });
        screens[name].classList.add("screen--active");
    }

    function setTheme(mode) {
        document.body.classList.remove("state-ok", "state-bad");
        if (mode === "ok") document.body.classList.add("state-ok");
        if (mode === "bad") document.body.classList.add("state-bad");
    }

    function allQuestions() {
        return categories.flatMap((category) => category.questions);
    }

    function findCategory(id) {
        return categories.find((category) => category.id === id);
    }

    function categoryNames(ids) {
        return ids.map((id) => findCategory(id)?.title).filter(Boolean).join(", ");
    }

    function countQuestions(ids) {
        return ids.reduce((sum, id) => sum + (findCategory(id)?.questions.length || 0), 0);
    }

    function categoryIdsForQuestionIds(questionIds) {
        const found = new Set();
        questionIds.forEach((id) => {
            const question = questionsById.get(id);
            if (question?.categoryId) found.add(question.categoryId);
        });
        return Array.from(found);
    }

    function clampNumber(value, min, max) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) return min;
        return Math.max(min, Math.min(parsed, max));
    }

    function randomId(prefix = "game") {
        const bytes = new Uint32Array(2);
        crypto.getRandomValues(bytes);
        return `${prefix}-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
    }

    function seedToNumber(seed) {
        const text = String(seed || "seed");
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function mulberry32(seed) {
        return () => {
            let t = (seed += 0x6D2B79F5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function seededShuffle(items, seed) {
        const random = mulberry32(seedToNumber(seed));
        const copy = items.slice();
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function shuffleAnswers(question) {
        const answers = [
            {slot: "A", source: "A", text: question.a},
            {slot: "B", source: "B", text: question.b}
        ];

        if (Math.random() < 0.5) answers.reverse();
        return answers;
    }

    function encodePayload(payload) {
        const json = JSON.stringify(payload);
        const bytes = new TextEncoder().encode(json);
        let binary = "";
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function decodePayload(token) {
        try {
            const padded = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
            const binary = atob(padded);
            const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
            return JSON.parse(new TextDecoder().decode(bytes));
        } catch (error) {
            return null;
        }
    }

    function appBaseUrl() {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        return url.toString();
    }

    function makeGameLink(config) {
        if (config.live) {
            const url = new URL(appBaseUrl());
            url.searchParams.set("game", config.id);
            return url.toString();
        }
        return `${appBaseUrl()}#game=${encodePayload(config)}`;
    }

    async function apiJson(path, options = {}) {
        const response = await fetch(path, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Server request failed.");
        return data;
    }

    function sanitizeGameConfig(raw) {
        if (!raw || typeof raw !== "object") return null;

        const validCategoryIds = new Set(categories.map((category) => category.id));
        const selectedQuestionIds = Array.isArray(raw.questionIds)
            ? raw.questionIds.map(String).filter((id) => questionsById.has(id))
            : [];
        const derivedCategories = categoryIdsForQuestionIds(selectedQuestionIds);
        const selected = Array.isArray(raw.categories)
            ? raw.categories.map(String).filter((id) => validCategoryIds.has(id))
            : derivedCategories;
        const categoriesForGame = selectedQuestionIds.length > 0 ? derivedCategories : selected;

        if (categoriesForGame.length === 0) return null;

        const maxQuestions = selectedQuestionIds.length || countQuestions(categoriesForGame);
        const limit = clampNumber(raw.limit, 1, maxQuestions);

        return {
            id: raw.id ? String(raw.id) : randomId("game"),
            title: String(raw.title || "Игра").trim().slice(0, 60) || "Игра",
            categories: categoriesForGame,
            questionIds: selectedQuestionIds,
            limit,
            seed: String(raw.seed || raw.id || randomId("seed")),
            createdAt: raw.createdAt || new Date().toISOString(),
            live: Boolean(raw.live)
        };
    }

    function buildQuestions(config) {
        const selectedIds = new Set(config.questionIds || []);
        const pool = config.categories
            .flatMap((id) => findCategory(id)?.questions || [])
            .filter((question) => selectedIds.size === 0 || selectedIds.has(question.id));
        const shuffled = seededShuffle(pool, config.seed || config.id);
        return shuffled.slice(0, Math.min(config.limit, shuffled.length));
    }

    function formatDuration(ms) {
        const seconds = Math.max(0, Math.round(ms / 1000));
        const mins = Math.floor(seconds / 60);
        const rest = seconds % 60;
        if (mins <= 0) return `${rest} сек`;
        return `${mins}:${String(rest).padStart(2, "0")}`;
    }

    function getPlayerName(inputValue) {
        const trimmed = String(inputValue || "").trim();
        return trimmed || "Игрок";
    }

    function normalizePlayerName(name) {
        return String(name || "Игрок").trim().toLowerCase();
    }

    function loadScoreStore() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function saveScoreStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }

    function compareScores(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        if ((a.durationMs || 0) !== (b.durationMs || 0)) return (a.durationMs || 0) - (b.durationMs || 0);
        return String(a.finishedAt).localeCompare(String(b.finishedAt));
    }

    function isBetterScore(next, current) {
        if (!current) return true;
        if (next.score !== current.score) return next.score > current.score;
        return (next.durationMs || 0) < (current.durationMs || Number.POSITIVE_INFINITY);
    }

    function saveLocalScore(record) {
        const store = loadScoreStore();
        const list = Array.isArray(store[record.gameId]) ? store[record.gameId] : [];
        const playerKey = normalizePlayerName(record.playerName);
        const existingIndex = list.findIndex((item) => normalizePlayerName(item.playerName) === playerKey);

        if (existingIndex === -1) {
            list.push(record);
        } else if (isBetterScore(record, list[existingIndex])) {
            list[existingIndex] = record;
        }

        const sorted = list.slice().sort(compareScores);
        store[record.gameId] = sorted;
        saveScoreStore(store);

        return {
            rows: sorted,
            rank: sorted.findIndex((item) => normalizePlayerName(item.playerName) === playerKey) + 1
        };
    }

    function getLocalScores(gameId) {
        const store = loadScoreStore();
        return (Array.isArray(store[gameId]) ? store[gameId] : []).slice().sort(compareScores);
    }

    function scoresForGame(gameId, providedRows) {
        if (Array.isArray(providedRows)) return providedRows;
        if (state.liveScores.has(gameId)) return state.liveScores.get(gameId);
        return getLocalScores(gameId);
    }

    function renderLeaderboard(container, gameId, emptyText = "Пока нет результатов.", providedRows) {
        if (!container || !gameId) return;

        const rows = scoresForGame(gameId, providedRows);
        container.hidden = false;
        container.innerHTML = "";

        const title = document.createElement("div");
        title.className = "leaderboard__title";
        title.textContent = "Живая таблица результатов";
        container.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "leaderboard__subtitle";
        subtitle.textContent = "Позиции: больше правильных ответов, при равенстве — меньше времени.";
        container.appendChild(subtitle);

        if (rows.length === 0) {
            const empty = document.createElement("div");
            empty.className = "leaderboard__empty";
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }

        const list = document.createElement("div");
        list.className = "leaderboard__rows";
        rows.slice(0, 8).forEach((row, index) => {
            const item = document.createElement("div");
            item.className = "leaderboard__row";

            const place = document.createElement("span");
            place.className = "leaderboard__place";
            place.textContent = `#${index + 1}`;

            const name = document.createElement("span");
            name.className = "leaderboard__name";
            name.textContent = row.playerName;

            const score = document.createElement("span");
            score.className = "leaderboard__score";
            score.textContent = `${row.score}/${row.total} • ${formatDuration(row.durationMs || 0)}`;

            item.append(place, name, score);
            list.appendChild(item);
        });

        container.appendChild(list);
    }

    function setNotice(el, message, show = true) {
        if (!el) return;
        el.textContent = message;
        el.hidden = !show;
    }

    function clearRoute() {
        window.history.replaceState(null, "", appBaseUrl());
    }

    function closeLiveStream() {
        if (liveSource) {
            liveSource.close();
            liveSource = null;
        }
    }

    function subscribeToGame(gameId) {
        if (!window.EventSource) return;
        if (liveSource) liveSource.close();

        liveSource = new EventSource(`/api/games/${encodeURIComponent(gameId)}/events`);
        liveSource.addEventListener("snapshot", (event) => {
            const snapshot = JSON.parse(event.data);
            const rows = Array.isArray(snapshot.scores) ? snapshot.scores : [];
            state.liveScores.set(gameId, rows);
            renderLeaderboard(joinLeaderboard, gameId);
            if (!leaderboardBox.hidden) renderLeaderboard(leaderboardBox, gameId);
        });
        liveSource.onerror = () => {
            if (state.currentGame?.id === gameId || state.pendingGame?.id === gameId) {
                setNotice(importNotice, "Live connection interrupted. The game will reconnect automatically.", true);
            }
        };
    }

    function copyText(text, button, doneText = "Скопировано!") {
        const original = button?.textContent;

        const markDone = () => {
            if (!button) return;
            button.textContent = doneText;
            setTimeout(() => {
                button.textContent = original;
            }, 1400);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(markDone).catch(() => fallbackCopy(text, markDone));
        } else {
            fallbackCopy(text, markDone);
        }
    }

    function fallbackCopy(text, callback) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        callback();
    }

    function renderStartMeta() {
        metaTotal.textContent = String(allQuestions().length);
        metaCategories.textContent = String(categories.length);
    }

    function renderCategoryCards() {
        categoryList.innerHTML = "";

        categories.forEach((category) => {
            const card = document.createElement("article");
            card.className = "category-card";

            const title = document.createElement("h3");
            title.className = "category-card__title";
            title.textContent = category.title;

            const desc = document.createElement("p");
            desc.className = "category-card__desc";
            desc.textContent = category.description;

            const meta = document.createElement("div");
            meta.className = "category-card__meta";
            meta.textContent = `${category.questions.length} вопросов`;

            const action = document.createElement("button");
            action.className = "btn btn--primary";
            action.type = "button";
            action.textContent = "Играть";
            action.addEventListener("click", () => startSolo(category.id, false));

            card.append(title, desc, meta, action);
            categoryList.appendChild(card);
        });
    }

    function selectedCreateCategoryIds() {
        return Array.from(createCategories.querySelectorAll("input[type='checkbox']:checked")).map((input) => input.value);
    }

    function updateQuestionLimitBounds() {
        const selected = selectedCreateCategoryIds();
        const max = Math.max(1, countQuestions(selected));
        questionLimit.max = String(max);
        questionLimit.value = String(clampNumber(questionLimit.value, 1, max));
        btnCreateGame.disabled = selected.length === 0;
        setNotice(createStatus, "", false);
        sharePanel.hidden = true;
        btnStartHost.disabled = true;
        generatedGame = null;
    }

    function renderCreateCategoryOptions() {
        createCategories.innerHTML = "";

        categories.forEach((category) => {
            const label = document.createElement("label");
            label.className = "topic-option";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = category.id;
            checkbox.checked = true;
            checkbox.addEventListener("change", updateQuestionLimitBounds);

            const body = document.createElement("span");
            body.className = "topic-option__body";

            const title = document.createElement("span");
            title.className = "topic-option__title";
            title.textContent = category.title;

            const count = document.createElement("span");
            count.className = "topic-option__count";
            count.textContent = `${category.questions.length} вопросов`;

            body.append(title, count);
            label.append(checkbox, body);
            createCategories.appendChild(label);
        });

        updateQuestionLimitBounds();
    }

    function collectCreateConfig() {
        const selected = selectedCreateCategoryIds();
        if (selected.length === 0) {
            setNotice(createStatus, "Выбери хотя бы одну тему.", true);
            return null;
        }

        const max = countQuestions(selected);
        const title = String(gameTitle.value || "").trim() || "Игра";

        return {
            title: title.slice(0, 60),
            categories: selected,
            limit: clampNumber(questionLimit.value, 1, max),
            seed: randomId("seed")
        };
    }

    function renderSharePanel(config) {
        const link = makeGameLink(config);
        shareLink.value = link;
        shareHint.textContent = `${config.limit} вопросов • ${categoryNames(config.categories)} • результаты обновляются live`;
        qrImage.src = `${QR_ENDPOINT}?size=220x220&data=${encodeURIComponent(link)}`;
        qrImage.hidden = false;
        sharePanel.hidden = false;
        btnStartHost.disabled = false;
    }

    function openCreateScreen() {
        setTheme("neutral");
        closeLiveStream();
        renderCreateCategoryOptions();
        showScreen("create");
    }

    function goStart({clearUrl = true} = {}) {
        setTheme("neutral");
        closeLiveStream();
        if (clearUrl) clearRoute();
        state.pendingGame = null;
        state.mode = "solo";
        showScreen("start");
    }

    function startSolo(categoryId = "all", doShuffle = false) {
        closeLiveStream();
        const categoryIds = categoryId === "all" ? categories.map((category) => category.id) : [categoryId];
        const validIds = categoryIds.filter((id) => findCategory(id));
        const max = countQuestions(validIds);
        const title = categoryId === "all" ? "Все темы" : findCategory(categoryId)?.title || "Игра";
        const limit = categoryId === "all" ? Math.min(12, max) : max;
        const seed = doShuffle ? randomId("solo") : `solo-${categoryId}`;

        state.lastSoloCategory = categoryId;
        startRun(
            {
                id: `solo-${categoryId}`,
                title,
                categories: validIds,
                limit,
                seed,
                solo: true,
                live: false
            },
            {mode: "solo", player: "Игрок"}
        );
    }

    function startCompetition(config, player) {
        startRun(config, {mode: "competition", player: getPlayerName(player)});
    }

    function startRun(config, options) {
        const sanitized = sanitizeGameConfig(config);
        if (!sanitized) {
            setNotice(importNotice, "Не удалось открыть игру: ссылка повреждена или темы больше недоступны.", true);
            goStart({clearUrl: false});
            return;
        }

        state.questions = buildQuestions(sanitized);
        state.idx = 0;
        state.score = 0;
        state.answered = false;
        state.mode = options.mode;
        state.currentGame = sanitized;
        state.playerName = options.player;
        state.startedAt = Date.now();
        state.resultSaved = false;
        state.lastScoreRecord = null;

        renderQuestion();
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

        questionCategory.textContent = q.categoryTitle || "Вопрос";
        questionText.textContent = q.prompt;
        questionSub.textContent = state.currentGame?.title ? `${state.currentGame.title} • выбери вариант` : "Выбери вариант";

        const answerSlots = shuffleAnswers(q);
        state.answerSlots = {
            A: answerSlots[0].source,
            B: answerSlots[1].source
        };
        btnAText.textContent = answerSlots[0].text;
        btnBText.textContent = answerSlots[1].text;

        btnA.disabled = false;
        btnB.disabled = false;
        btnNext.textContent = state.idx === state.questions.length - 1 ? "Финиш" : "Дальше";

        resultBox.removeAttribute("style");
        updateProgress();
        updateTopUI();

        showScreen("question");
    }

    function lockAnswers() {
        btnA.disabled = true;
        btnB.disabled = true;
    }

    function renderResultSources(sources) {
        if (!resultSources || !resultSourcesList) return;

        resultSourcesList.innerHTML = "";
        if (!Array.isArray(sources) || sources.length === 0) {
            resultSources.hidden = true;
            return;
        }

        sources.forEach((source) => {
            if (!source?.url) return;

            const li = document.createElement("li");
            const link = document.createElement("a");
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noreferrer noopener";
            link.textContent = source.title || source.url;
            li.appendChild(link);
            resultSourcesList.appendChild(li);
        });

        resultSources.hidden = resultSourcesList.children.length === 0;
    }

    function answer(choice) {
        if (state.answered) return;
        state.answered = true;

        const q = state.questions[state.idx];
        const visibleSlot = choice.toUpperCase() === "B" ? "B" : "A";
        const selected = state.answerSlots[visibleSlot] || visibleSlot;
        const isCorrect = selected === q.correct;

        lockAnswers();

        if (isCorrect) state.score += 1;

        const total = state.questions.length;
        const current = state.idx + 1;

        resultMeta.textContent = `Вопрос ${current} из ${total}`;
        resultText.textContent = q.explanation;
        renderResultSources(q.sources);

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
        showScreen("result");
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
        if (pct >= 90) return "Супер! Очень сильный результат.";
        if (pct >= 70) return "Очень хорошо! Уверенная победа.";
        if (pct >= 50) return "Неплохо! Есть над чем подтянуться, но база уже есть.";
        return "Это только начало. Перезапусти и возьми реванш!";
    }

    function createScoreRecord() {
        const total = state.questions.length || 0;
        return {
            id: randomId("score"),
            gameId: state.currentGame.id,
            gameTitle: state.currentGame.title,
            playerName: state.playerName,
            score: state.score,
            total,
            durationMs: Date.now() - state.startedAt,
            finishedAt: new Date().toISOString()
        };
    }

    async function saveLiveScore(record) {
        const data = await apiJson(`/api/games/${encodeURIComponent(record.gameId)}/scores`, {
            method: "POST",
            body: JSON.stringify(record)
        });
        state.liveScores.set(record.gameId, data.scores || []);
        renderLeaderboard(leaderboardBox, record.gameId);
        return data.rank || 1;
    }

    function showFinal() {
        setTheme("neutral");
        const total = state.questions.length || 0;
        finalScore.textContent = `${state.score}/${total}`;

        progressBar.style.width = "100%";
        statusText.textContent = `Вопрос ${total} из ${total}`;
        updateTopUI();

        if (state.mode === "competition") {
            finalTitle.textContent = `${state.playerName}, финиш!`;
            btnRestart.textContent = "Повторить игру";
            btnShare.textContent = "Скопировать результат";
            state.lastScoreRecord = createScoreRecord();

            if (state.currentGame.live) {
                finalText.textContent = "Сохраняем результат в живую таблицу...";
                renderLeaderboard(leaderboardBox, state.currentGame.id, "Пока нет результатов.");
                showScreen("final");

                if (!state.resultSaved) {
                    state.resultSaved = true;
                    saveLiveScore(state.lastScoreRecord)
                        .then((rank) => {
                            finalText.textContent = `Место #${rank} в живой таблице. Время: ${formatDuration(state.lastScoreRecord.durationMs)}.`;
                        })
                        .catch((error) => {
                            const saved = saveLocalScore(state.lastScoreRecord);
                            finalText.textContent = `Сервер не принял результат (${error.message}). Локальное место: #${saved.rank}.`;
                            renderLeaderboard(leaderboardBox, state.currentGame.id, "Пока нет результатов.", saved.rows);
                        });
                }
                return;
            }

            if (!state.resultSaved) {
                const saved = saveLocalScore(state.lastScoreRecord);
                state.resultSaved = true;
                finalText.textContent = `Место #${saved.rank} в локальной таблице. Время: ${formatDuration(state.lastScoreRecord.durationMs)}.`;
            }

            renderLeaderboard(leaderboardBox, state.currentGame.id);
        } else {
            finalTitle.textContent = "Готово!";
            finalText.textContent = getFinalMessage(state.score, total);
            btnRestart.textContent = "Сыграть ещё раз";
            btnShare.textContent = "Скопировать результат";
            leaderboardBox.hidden = true;
            leaderboardBox.innerHTML = "";
        }

        showScreen("final");
    }

    function renderJoinScreen(config, scores = []) {
        state.pendingGame = config;
        const existingName = localStorage.getItem(PLAYER_KEY) || "";
        playerName.value = existingName;
        joinTitle.textContent = config.title;
        joinSummary.textContent = `${config.limit} вопросов • ${categoryNames(config.categories)} • live-результаты`;
        state.liveScores.set(config.id, scores);
        renderLeaderboard(joinLeaderboard, config.id, "Результатов ещё нет. Ты можешь быть первым.");

        if (config.live) subscribeToGame(config.id);

        showScreen("join");
    }

    async function joinLiveGame(config, name) {
        if (!config.live) return;
        const data = await apiJson(`/api/games/${encodeURIComponent(config.id)}/join`, {
            method: "POST",
            body: JSON.stringify({playerName: name})
        });
        state.liveScores.set(config.id, data.scores || []);
    }

    async function joinPendingGame() {
        if (!state.pendingGame) return;

        const name = getPlayerName(playerName.value);
        const original = btnJoinGame.textContent;
        btnJoinGame.disabled = true;
        btnJoinGame.textContent = "Входим...";

        try {
            await joinLiveGame(state.pendingGame, name);
            localStorage.setItem(PLAYER_KEY, name);
            startCompetition(state.pendingGame, name);
        } catch (error) {
            setNotice(importNotice, `Не удалось войти в игру: ${error.message}`, true);
        } finally {
            btnJoinGame.disabled = false;
            btnJoinGame.textContent = original;
        }
    }

    function copyResult() {
        const total = state.questions.length || 0;

        if (state.mode === "competition" && state.lastScoreRecord) {
            const link = makeGameLink(state.currentGame);
            const text = `${state.lastScoreRecord.gameTitle}: ${state.playerName} — ${state.score}/${total}, время ${formatDuration(state.lastScoreRecord.durationMs)}. Таблица: ${link}`;
            copyText(text, btnShare);
            return;
        }

        copyText(`Мой результат в “Миф или Правда”: ${state.score}/${total}`, btnShare);
    }

    function importResultFromHash(payload) {
        if (!payload || payload.type !== "result" || !payload.gameId || !payload.playerName) return null;

        const record = {
            id: payload.id || randomId("score"),
            gameId: String(payload.gameId),
            gameTitle: String(payload.gameTitle || "Игра"),
            playerName: String(payload.playerName || "Игрок").slice(0, 32),
            score: clampNumber(payload.score, 0, 999),
            total: clampNumber(payload.total, 1, 999),
            durationMs: Math.max(0, Number(payload.durationMs) || 0),
            finishedAt: payload.finishedAt || new Date().toISOString()
        };

        const saved = saveLocalScore(record);
        setNotice(importNotice, `Результат добавлен локально: ${record.playerName} — ${record.score}/${record.total}, место #${saved.rank}.`, true);
        return sanitizeGameConfig(payload.game);
    }

    async function loadLiveGame(gameId) {
        const data = await apiJson(`/api/games/${encodeURIComponent(gameId)}`);
        const config = sanitizeGameConfig({...data.game, live: true});
        if (!config) throw new Error("Game data is not compatible with this question set.");
        renderJoinScreen(config, data.scores || []);
    }

    async function handleRoute() {
        const url = new URL(window.location.href);
        const gameId = url.searchParams.get("game");

        if (gameId) {
            try {
                await loadLiveGame(gameId);
            } catch (error) {
                setNotice(importNotice, `Не удалось открыть live-игру: ${error.message}`, true);
                showScreen("start");
            }
            return;
        }

        const params = new URLSearchParams(window.location.hash.slice(1));
        const resultToken = params.get("result");
        const gameToken = params.get("game");

        if (resultToken) {
            const config = importResultFromHash(decodePayload(resultToken));
            if (config) renderJoinScreen(config);
            else showScreen("start");
            return;
        }

        if (gameToken) {
            const config = sanitizeGameConfig(decodePayload(gameToken));
            if (config) {
                renderJoinScreen(config);
                return;
            }
            setNotice(importNotice, "Не удалось открыть игру: ссылка повреждена.", true);
        }

        showScreen("start");
    }

    async function createHostedGame() {
        const draft = collectCreateConfig();
        if (!draft) return;

        const original = btnCreateGame.textContent;
        btnCreateGame.disabled = true;
        btnCreateGame.textContent = "Создаём...";
        setNotice(createStatus, "", false);

        try {
            const data = await apiJson("/api/games", {
                method: "POST",
                body: JSON.stringify(draft)
            });
            generatedGame = sanitizeGameConfig({...data.game, live: true});
            renderSharePanel(generatedGame);
            subscribeToGame(generatedGame.id);
        } catch (error) {
            setNotice(createStatus, `Не удалось создать live-игру. Запусти приложение через Node server. Детали: ${error.message}`, true);
        } finally {
            btnCreateGame.disabled = false;
            btnCreateGame.textContent = original;
        }
    }

    async function startGeneratedGameAsHost() {
        if (!generatedGame) return;
        const name = getPlayerName(hostName.value || "Организатор");
        try {
            await joinLiveGame(generatedGame, name);
            startCompetition(generatedGame, name);
        } catch (error) {
            setNotice(createStatus, `Не удалось войти как участник: ${error.message}`, true);
        }
    }

    function isEditableEvent(e) {
        const tag = e.target?.tagName?.toLowerCase();
        return tag === "input" || tag === "textarea" || e.target?.isContentEditable;
    }

    btnStart.addEventListener("click", () => startSolo("all", false));
    btnShuffle.addEventListener("click", () => startSolo("all", true));
    btnOpenCreate.addEventListener("click", () => openCreateScreen());
    btnResetTop.addEventListener("click", () => goStart());
    btnBackFromCreate.addEventListener("click", () => goStart());
    questionLimit.addEventListener("input", updateQuestionLimitBounds);
    questionLimit.addEventListener("change", updateQuestionLimitBounds);
    btnCreateGame.addEventListener("click", () => createHostedGame());
    btnStartHost.addEventListener("click", () => startGeneratedGameAsHost());
    btnCopyLink.addEventListener("click", () => copyText(shareLink.value, btnCopyLink));
    btnJoinGame.addEventListener("click", () => joinPendingGame());
    btnJoinBack.addEventListener("click", () => goStart());

    btnA.addEventListener("click", () => answer("A"));
    btnB.addEventListener("click", () => answer("B"));
    btnNext.addEventListener("click", () => next());
    btnToStart.addEventListener("click", () => goStart());

    btnRestart.addEventListener("click", () => {
        if (state.mode === "competition" && state.currentGame) {
            startCompetition(state.currentGame, state.playerName);
            return;
        }
        startSolo(state.lastSoloCategory, true);
    });
    btnShare.addEventListener("click", () => copyResult());
    btnFinalHome.addEventListener("click", () => goStart());

    window.addEventListener("keydown", (e) => {
        if (isEditableEvent(e)) return;

        const activeStart = screens.start.classList.contains("screen--active");
        const activeJoin = screens.join.classList.contains("screen--active");
        const activeQuestion = screens.question.classList.contains("screen--active");
        const activeResult = screens.result.classList.contains("screen--active");
        const activeFinal = screens.final.classList.contains("screen--active");

        if (activeStart && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            startSolo("all", false);
            return;
        }

        if (activeJoin && e.key === "Enter") {
            e.preventDefault();
            joinPendingGame();
            return;
        }

        if (activeQuestion) {
            if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "а") answer("A");
            if (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "в") answer("B");
            return;
        }

        if (activeResult && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            next();
            return;
        }

        if (activeFinal && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            btnRestart.click();
        }
    });

    window.addEventListener("hashchange", () => handleRoute());
    window.addEventListener("popstate", () => handleRoute());

    renderStartMeta();
    renderCategoryCards();
    renderCreateCategoryOptions();
    handleRoute();
})();
