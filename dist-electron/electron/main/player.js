import fs from "fs";
import { spawn } from "child_process";
import net from "net";
import { getDb, getMediaItem, getSettings, log, now } from "./db.js";
import { updateBangumiSubjectStatus } from "./bangumiSync.js";
export function playFile(mediaFileId) {
    const file = getDb().prepare("SELECT * FROM media_files WHERE id = ?").get(mediaFileId);
    if (!file)
        throw new Error("Media file not found");
    const item = getMediaItem(file.media_item_id);
    const settings = getSettings();
    const mpvPath = settings.mpvPath?.trim() || "mpv";
    const args = parseArgs(settings.mpvArgs || "--force-window=yes");
    if (settings.mpvPath?.trim() && !fs.existsSync(mpvPath)) {
        log("error", "player", `mpv 路径不存在：${mpvPath}`, undefined, file.media_item_id);
        throw new Error(`mpv 路径不存在：${mpvPath}`);
    }
    const pipeName = `\\\\.\\pipe\\local-anime-library-${process.pid}-${mediaFileId}-${Date.now()}`;
    const resumeArgs = file.last_position && file.last_position > 5 ? [`--start=${Math.max(0, Math.floor(file.last_position - 2))}`] : [];
    const child = spawn(mpvPath, [...args, ...resumeArgs, `--input-ipc-server=${pipeName}`, file.file_path], { detached: true, stdio: "ignore" });
    child.on("error", (error) => {
        log("error", "player", `启动失败：${error.message}`, undefined, file.media_item_id);
    });
    const startedAt = Date.now();
    getDb()
        .prepare(`
      UPDATE media_files SET watched = 'watching', play_count = play_count + 1, last_played_at = ?, updated_at = ? WHERE id = ?;
    `)
        .run(now(), now(), mediaFileId);
    getDb()
        .prepare("UPDATE media_items SET watch_status = 'watching', last_played_at = ?, updated_at = ? WHERE id = ?")
        .run(now(), now(), file.media_item_id);
    const history = getDb()
        .prepare("INSERT INTO watch_history (media_item_id, media_file_id, played_at, completed, player) VALUES (?, ?, ?, 0, 'mpv')")
        .run(file.media_item_id, mediaFileId, now());
    void monitorMpvPlayback({
        child,
        pipeName,
        startedAt,
        historyId: Number(history.lastInsertRowid),
        file,
        mediaItemId: file.media_item_id,
        title: item?.title || item?.clean_name || file.file_name
    });
    child.unref();
    log("info", "player", `启动 mpv 播放：${item?.title || item?.clean_name || file.file_name}/${file.file_name}`, file.file_path, file.media_item_id);
}
export function playUrl(url, title, referer, bangumiId) {
    const target = url.trim();
    if (!target) {
        log("error", "player", "播放地址为空", undefined);
        throw new Error("播放地址为空");
    }
    const settings = getSettings();
    const mpvPath = settings.mpvPath?.trim() || "mpv";
    const args = parseArgs(settings.mpvArgs || "--force-window=yes");
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    args.push(`--http-header-fields=User-Agent: ${ua}`);
    if (referer) {
        args.push(`--http-header-fields=Referer: ${referer}`);
    }
    if (settings.mpvPath?.trim() && !fs.existsSync(mpvPath)) {
        log("error", "player", `mpv 路径不存在：${mpvPath}`, undefined);
        throw new Error(`mpv 路径不存在：${mpvPath}`);
    }
    const pipeName = `\\\\.\\pipe\\local-anime-library-online-${process.pid}-${Date.now()}`;
    const child = spawn(mpvPath, [...args, `--input-ipc-server=${pipeName}`, target], { detached: true, stdio: "ignore" });
    const startedAt = Date.now();
    // Record to history
    const history = getDb()
        .prepare("INSERT INTO watch_history (online_title, bangumi_id, played_at, completed, player) VALUES (?, ?, ?, 0, 'mpv')")
        .run(title || target, bangumiId ? String(bangumiId) : null, now());
    void monitorMpvPlayback({
        child,
        pipeName,
        startedAt,
        historyId: Number(history.lastInsertRowid),
        title: title || target,
        bangumiId,
        onlineTitle: title || target
    });
    // Log the actual command for debugging (masking potentially sensitive URLs)
    const displayUrl = target.length > 60 ? target.substring(0, 30) + "..." + target.substring(target.length - 20) : target;
    log("info", "player", `启动 mpv 播放：${title || displayUrl}`, {
        mpvPath,
        args: args.join(" "),
        url: displayUrl
    });
    child.on("error", (error) => {
        log("error", "player", `启动 mpv 在线播放失败：${error.message}`, { mpvPath, url: target });
    });
    child.unref();
}
async function monitorMpvPlayback({ child, pipeName, startedAt, historyId, file, mediaItemId, title, bangumiId, onlineTitle }) {
    let socket = null;
    let timer = null;
    let requestId = 1;
    const pending = new Map();
    const state = {
        watchedSeconds: 0,
        lastPosition: null,
        lastPollAt: null,
        lastPaused: false,
        mediaDuration: null,
        percent: 0,
        usedIpc: false,
        syncedWatching: false,
        lastDbUpdateSeconds: 0
    };
    const finalize = async () => {
        if (timer)
            clearInterval(timer);
        socket?.destroy();
        const fallbackSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const watchedSeconds = Math.max(1, Math.round(state.usedIpc ? state.watchedSeconds : fallbackSeconds));
        const position = state.lastPosition ?? watchedSeconds;
        const completed = state.percent >= 90 || Boolean(state.mediaDuration && position / state.mediaDuration >= 0.9);
        getDb()
            .prepare("UPDATE watch_history SET duration = ?, position = ?, completed = ? WHERE id = ?")
            .run(watchedSeconds, position, completed ? 1 : 0, historyId);
        if (file) {
            getDb()
                .prepare("UPDATE media_files SET duration = COALESCE(?, duration), last_position = ?, watched = CASE WHEN ? THEN 'watched' ELSE watched END, updated_at = ? WHERE id = ?")
                .run(state.mediaDuration, position, completed ? 1 : 0, now(), file.id);
            if (completed)
                refreshItemWatchStatus(file.media_item_id);
        }
        // Bangumi Sync: Finalize status
        if (completed) {
            let bId = bangumiId;
            if (!bId && mediaItemId) {
                const item = getMediaItem(mediaItemId);
                if (item?.provider === "bangumi")
                    bId = item.external_id || undefined;
            }
            if (bId) {
                const settings = getSettings();
                if (settings.bangumiToken) {
                    try {
                        await updateBangumiSubjectStatus(settings.bangumiToken, bId, 2); // 2: 看过
                        log("info", "player", `已将 Bangumi 状态更新为“看过”：${title}`, { bangumiId: bId });
                    }
                    catch (e) {
                        log("warning", "player", `同步 Bangumi 状态失败：${e instanceof Error ? e.message : String(e)}`);
                    }
                }
            }
        }
        log("info", "player", `mpv 播放结束：${title}，真实播放 ${formatDuration(watchedSeconds)}，位置 ${formatDuration(Math.round(position))}`, file?.file_path || onlineTitle);
    };
    child.once("exit", finalize);
    try {
        socket = await connectMpvIpc(pipeName);
        state.usedIpc = true;
        socket.on("data", (chunk) => {
            for (const line of chunk.toString("utf8").split(/\r?\n/).filter(Boolean)) {
                try {
                    const message = JSON.parse(line);
                    if (message.request_id && pending.has(message.request_id)) {
                        pending.get(message.request_id)?.(message.data);
                        pending.delete(message.request_id);
                    }
                }
                catch {
                    // Ignore
                }
            }
        });
        const getProperty = (name) => new Promise((resolve) => {
            if (!socket || socket.destroyed)
                return resolve(null);
            const id = requestId++;
            pending.set(id, resolve);
            socket.write(JSON.stringify({ command: ["get_property", name], request_id: id }) + "\n");
            windowTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    resolve(null);
                }
            }, 900);
        });
        const poll = async () => {
            const [positionRaw, durationRaw, pauseRaw, percentRaw] = await Promise.all([
                getProperty("time-pos"),
                getProperty("duration"),
                getProperty("pause"),
                getProperty("percent-pos")
            ]);
            const position = typeof positionRaw === "number" ? positionRaw : null;
            const duration = typeof durationRaw === "number" ? durationRaw : null;
            const paused = pauseRaw === true;
            const percent = typeof percentRaw === "number" ? percentRaw : 0;
            const polledAt = Date.now();
            if (duration)
                state.mediaDuration = duration;
            if (percent)
                state.percent = percent;
            if (position !== null) {
                if (state.lastPollAt !== null && state.lastPosition !== null && !state.lastPaused) {
                    const wallDelta = (polledAt - state.lastPollAt) / 1000;
                    const delta = position - state.lastPosition;
                    if (delta > 0 && wallDelta > 0 && wallDelta < 8)
                        state.watchedSeconds += Math.min(wallDelta, delta + 1.2);
                }
                state.lastPosition = position;
                // PERIODIC UPDATE: Update database every ~60 seconds of watched time
                if (state.watchedSeconds > 0 && Math.floor(state.watchedSeconds / 60) > Math.floor((state.lastDbUpdateSeconds || 0) / 60)) {
                    state.lastDbUpdateSeconds = state.watchedSeconds;
                    const completed = state.percent >= 90 || Boolean(state.mediaDuration && position / state.mediaDuration >= 0.9);
                    getDb()
                        .prepare("UPDATE watch_history SET duration = ?, position = ?, completed = ? WHERE id = ?")
                        .run(Math.round(state.watchedSeconds), Math.round(position), completed ? 1 : 0, historyId);
                    if (file) {
                        getDb()
                            .prepare("UPDATE media_files SET duration = COALESCE(?, duration), last_position = ?, updated_at = ? WHERE id = ?")
                            .run(state.mediaDuration, Math.round(position), now(), file.id);
                    }
                }
                // Bangumi Sync: Set "Watching" when play starts
                if (!state.syncedWatching && position > 2 && state.watchedSeconds > 5) {
                    state.syncedWatching = true;
                    let bId = bangumiId;
                    if (!bId && mediaItemId) {
                        const item = getMediaItem(mediaItemId);
                        if (item?.provider === "bangumi")
                            bId = item.external_id || undefined;
                    }
                    if (bId) {
                        const settings = getSettings();
                        if (settings.bangumiToken) {
                            try {
                                await updateBangumiSubjectStatus(settings.bangumiToken, bId, 3); // 3: 在看
                                log("info", "player", `已将 Bangumi 状态更新为“在看”：${title}`, { bangumiId: bId });
                            }
                            catch (e) {
                                // Silently fail or log warning
                                log("warning", "player", `同步 Bangumi 状态失败：${e instanceof Error ? e.message : String(e)}`);
                            }
                        }
                    }
                }
            }
            state.lastPaused = paused;
            state.lastPollAt = polledAt;
        };
        await poll();
        timer = setInterval(() => void poll(), 1000);
    }
    catch (error) {
        log("warning", "player", "mpv IPC 连接失败，回退到进程时长统计", error instanceof Error ? error.message : String(error));
    }
}
function connectMpvIpc(pipeName) {
    return new Promise((resolve, reject) => {
        let tries = 0;
        const tryConnect = () => {
            const socket = net.createConnection(pipeName);
            socket.once("connect", () => resolve(socket));
            socket.once("error", (error) => {
                socket.destroy();
                tries += 1;
                if (tries >= 50)
                    reject(error);
                else
                    setTimeout(tryConnect, 120);
            });
        };
        tryConnect();
    });
}
function windowTimeout(callback, ms) {
    return setTimeout(callback, ms);
}
export function setFileWatched(mediaFileId, watched) {
    const file = getDb().prepare("SELECT * FROM media_files WHERE id = ?").get(mediaFileId);
    if (!file)
        throw new Error("Media file not found");
    getDb().prepare("UPDATE media_files SET watched = ?, updated_at = ? WHERE id = ?").run(watched ? "watched" : "unwatched", now(), mediaFileId);
    refreshItemWatchStatus(file.media_item_id);
}
export function setItemWatchStatus(mediaItemId, status) {
    assertWatchStatus(status);
    getDb().prepare("UPDATE media_files SET watched = ?, updated_at = ? WHERE media_item_id = ?").run(status, now(), mediaItemId);
    getDb().prepare("UPDATE media_items SET watch_status = ?, updated_at = ? WHERE id = ?").run(status, now(), mediaItemId);
}
export function setFileStatus(mediaFileId, status) {
    assertWatchStatus(status);
    const file = getDb().prepare("SELECT * FROM media_files WHERE id = ?").get(mediaFileId);
    if (!file)
        throw new Error("Media file not found");
    getDb().prepare("UPDATE media_files SET watched = ?, updated_at = ? WHERE id = ?").run(status, now(), mediaFileId);
    refreshItemWatchStatus(file.media_item_id);
}
function refreshItemWatchStatus(mediaItemId) {
    const row = getDb()
        .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN watched = 0 OR watched = 'unwatched' THEN 1 ELSE 0 END) AS unwatched,
        SUM(CASE WHEN watched = 1 OR watched = 'watched' THEN 1 ELSE 0 END) AS watched,
        SUM(CASE WHEN watched = 'watching' THEN 1 ELSE 0 END) AS watching,
        SUM(CASE WHEN watched = 'on_hold' THEN 1 ELSE 0 END) AS on_hold,
        SUM(CASE WHEN watched = 'dropped' THEN 1 ELSE 0 END) AS dropped
      FROM media_files
      WHERE media_item_id = ?
    `)
        .get(mediaItemId);
    let status = "unwatched";
    if (row.total > 0 && row.dropped === row.total)
        status = "dropped";
    else if (row.total > 0 && row.on_hold === row.total)
        status = "on_hold";
    else if (row.total > 0 && row.watched === row.total)
        status = "watched";
    else if (row.watching > 0 || row.watched > 0 || row.on_hold > 0 || row.dropped > 0)
        status = "watching";
    getDb().prepare("UPDATE media_items SET watch_status = ?, updated_at = ? WHERE id = ?").run(status, now(), mediaItemId);
}
function assertWatchStatus(status) {
    if (!["unwatched", "watching", "watched", "on_hold", "dropped"].includes(status)) {
        throw new Error(`Invalid watch status: ${status}`);
    }
}
function parseArgs(value) {
    const matches = value.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return matches.map((part) => part.replace(/^"|"$/g, ""));
}
function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}分${rest}秒`;
}
