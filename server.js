const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const games = new Map();
const streams = new Map();
let idCounter = 0;

const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8"
};

function randomId(prefix) {
    const time = Date.now().toString(36);
    const counter = (idCounter++).toString(36);
    return `${prefix}-${time}-${counter}-${crypto.randomBytes(6).toString("hex")}`;
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body)
    });
    res.end(body);
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                reject(new Error("Request body too large"));
                req.destroy();
            }
        });
        req.on("end", () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON"));
            }
        });
    });
}

function sanitizeText(value, fallback, maxLength) {
    const text = String(value || "").trim();
    return (text || fallback).slice(0, maxLength);
}

function sanitizeGame(body) {
    const categories = Array.isArray(body.categories)
        ? body.categories.map((id) => String(id).trim()).filter(Boolean).slice(0, 20)
        : [];
    const questionIds = Array.isArray(body.questionIds)
        ? body.questionIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 500)
        : [];

    if (categories.length === 0) {
        return null;
    }

    const maxLimit = questionIds.length > 0 ? questionIds.length : 100;
    const limit = Math.max(1, Math.min(Number.parseInt(body.limit, 10) || 10, maxLimit, 100));

    return {
        id: randomId("game"),
        title: sanitizeText(body.title, "Игра", 60),
        categories,
        questionIds,
        limit,
        seed: sanitizeText(body.seed, randomId("seed"), 80),
        createdAt: new Date().toISOString(),
        scores: [],
        players: []
    };
}

function publicGame(game) {
    return {
        id: game.id,
        title: game.title,
        categories: game.categories,
        questionIds: game.questionIds,
        limit: game.limit,
        seed: game.seed,
        createdAt: game.createdAt,
        live: true
    };
}

function normalizePlayerName(name) {
    return String(name || "Игрок").trim().toLowerCase();
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

function sanitizeScore(game, body) {
    const total = Math.max(1, Math.min(Number.parseInt(body.total, 10) || game.limit, 100));
    const score = Math.max(0, Math.min(Number.parseInt(body.score, 10) || 0, total));
    return {
        id: sanitizeText(body.id, randomId("score"), 80),
        gameId: game.id,
        gameTitle: game.title,
        playerName: sanitizeText(body.playerName, "Игрок", 32),
        score,
        total,
        durationMs: Math.max(0, Math.min(Number(body.durationMs) || 0, 24 * 60 * 60 * 1000)),
        finishedAt: new Date().toISOString()
    };
}

function upsertScore(game, score) {
    const playerKey = normalizePlayerName(score.playerName);
    const existingIndex = game.scores.findIndex((item) => normalizePlayerName(item.playerName) === playerKey);

    if (existingIndex === -1) {
        game.scores.push(score);
    } else if (isBetterScore(score, game.scores[existingIndex])) {
        game.scores[existingIndex] = score;
    }

    game.scores.sort(compareScores);
    return game.scores.findIndex((item) => normalizePlayerName(item.playerName) === playerKey) + 1;
}

function addPlayer(game, playerName) {
    const cleanName = sanitizeText(playerName, "Игрок", 32);
    const key = normalizePlayerName(cleanName);
    const existing = game.players.find((player) => normalizePlayerName(player.name) === key);
    if (existing) {
        existing.lastSeenAt = new Date().toISOString();
        return existing;
    }

    const player = {
        id: randomId("player"),
        name: cleanName,
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
    };
    game.players.push(player);
    return player;
}

function gameSnapshot(game) {
    return {
        game: publicGame(game),
        scores: game.scores,
        players: game.players
    };
}

function sendEvent(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(game) {
    const clients = streams.get(game.id);
    if (!clients) return;

    const payload = gameSnapshot(game);
    clients.forEach((res) => sendEvent(res, "snapshot", payload));
}

async function handleApi(req, res, url) {
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, {ok: true, games: games.size});
        return;
    }

    if (req.method === "POST" && url.pathname === "/api/games") {
        const body = await readJson(req);
        const game = sanitizeGame(body);
        if (!game) {
            sendJson(res, 400, {error: "Select at least one category."});
            return;
        }

        games.set(game.id, game);
        sendJson(res, 201, {game: publicGame(game), scores: [], players: []});
        return;
    }

    if (parts[0] === "api" && parts[1] === "games" && parts[2]) {
        const game = games.get(parts[2]);
        if (!game) {
            sendJson(res, 404, {error: "Game not found."});
            return;
        }

        if (req.method === "GET" && parts.length === 3) {
            sendJson(res, 200, gameSnapshot(game));
            return;
        }

        if (req.method === "GET" && parts[3] === "events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no"
            });
            res.write(": connected\n\n");
            sendEvent(res, "snapshot", gameSnapshot(game));

            if (!streams.has(game.id)) streams.set(game.id, new Set());
            streams.get(game.id).add(res);

            req.on("close", () => {
                const clients = streams.get(game.id);
                if (!clients) return;
                clients.delete(res);
                if (clients.size === 0) streams.delete(game.id);
            });
            return;
        }

        if (req.method === "POST" && parts[3] === "join") {
            const body = await readJson(req);
            const player = addPlayer(game, body.playerName);
            broadcast(game);
            sendJson(res, 200, {player, ...gameSnapshot(game)});
            return;
        }

        if (req.method === "POST" && parts[3] === "scores") {
            const body = await readJson(req);
            const score = sanitizeScore(game, body);
            const rank = upsertScore(game, score);
            broadcast(game);
            sendJson(res, 200, {rank, score, ...gameSnapshot(game)});
            return;
        }
    }

    sendJson(res, 404, {error: "Not found."});
}

function serveStatic(req, res, url) {
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(ROOT, `.${decodeURIComponent(requestPath)}`);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
            res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"});
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            "Content-Type": contentTypes[ext] || "application/octet-stream",
            "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60"
        });
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
        handleApi(req, res, url).catch((error) => {
            sendJson(res, 400, {error: error.message || "Bad request."});
        });
        return;
    }

    serveStatic(req, res, url);
});

server.listen(PORT, HOST, () => {
    console.log(`Live quiz server running at http://localhost:${PORT}/`);
});
