import path from "node:path";
import fs from "node:fs";
import { BrowserWindow, Menu, app, dialog, ipcMain, net, protocol, shell } from "electron";
import { fileURLToPath } from "node:url";
import { addLocalSourceByPath, deleteSource, getMediaItem, getSettings, listCandidates, listScrapeIssues, listLogs, listMediaFiles, listMediaItems, listSources, getWatchStats, recleanMediaItemNames, renameSource, setSetting } from "./db.js";
import { scanLocalSource } from "./scanner.js";
import { addWebDavSourceAndTest, downloadWebDavSyncState, scanWebDavSource, uploadWebDavSyncState } from "./webdav.js";
import { applyBangumiCandidate, batchRefreshBangumiById, batchSearchBangumi, clearCoverCache, getAnimeByTag, getBangumiCalendar, getBangumiPersonDetail, getBangumiSubjectDetail, getPopularTags, refreshBangumiById, repairCoverCache, resolveMediaCover, searchBangumi } from "./scraper.js";
import { playFile, playUrl, setFileStatus, setFileWatched, setItemWatchStatus } from "./player.js";
import { syncLocalWatchStatusToBangumi, testBangumiToken } from "./bangumiSync.js";
import { listOnlineRules, onlineEpisodes, onlineSearch, sniffAndPlay } from "./online.js";
import { getSeasonAnime } from "./bangumiSeason.js";
import { getMikanBangumi, refreshAllSubscriptions, refreshSubscription, searchMikan, sendPendingItemsToQbittorrent, sendRssItemToQbittorrent, sendUrlToQbittorrent, subscriptionAdd, subscriptionDelete, subscriptionItems, subscriptionsList, testQbittorrent } from "./subscriptions.js";
import { listPan123OfflineTasks, refreshAllPan123OfflineTasks, refreshPan123OfflineTask, submitPan123OfflineDownload } from "./pan123.js";
import { listPikpakOfflineTasks, refreshPikpakOfflineTasks, submitPikpakOfflineDownload } from "./pikpak.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = app.getAppPath();
const coverPathCache = new Map();
function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 980,
        minHeight: 640,
        backgroundColor: "#fff0f7",
        title: "Local Anime Library",
        frame: false,
        autoHideMenuBar: true,
        icon: path.join(appRoot, "build/icon.ico"),
        webPreferences: {
            preload: path.join(appRoot, "electron/preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    win.webContents.on("did-fail-load", (_, errorCode, errorDescription, validatedUrl) => {
        void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderFatalError(`页面加载失败：${errorDescription}`, `URL: ${validatedUrl}\nCode: ${errorCode}`))}`);
    });
    win.webContents.on("render-process-gone", (_, details) => {
        void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderFatalError("渲染进程崩溃", JSON.stringify(details, null, 2)))}`);
    });
    win.webContents.on("console-message", (_, level, message) => {
        if (level >= 2)
            console.error(`[renderer] ${message}`);
    });
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    if (devUrl) {
        void win.loadURL(devUrl);
    }
    else {
        const indexPath = path.join(__dirname, "../../../dist/index.html");
        if (fs.existsSync(indexPath)) {
            void win.loadFile(indexPath);
        }
        else {
            void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderFatalError("前端页面还没有构建", `缺少文件：${indexPath}\n请运行 npm run dev 或 npx vite build。`))}`);
        }
    }
    win.webContents.once("did-finish-load", () => {
        setTimeout(() => {
            void checkLibrariesOnStartup(win);
        }, 1200);
    });
    return win;
}
app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle("local-file", (request) => {
        const encodedPath = request.url.replace(/^local-file:\/\//, "");
        const filePath = decodeURIComponent(encodedPath);
        return net.fetch(`file:///${filePath.replace(/\\/g, "/").replace(/^\/+/, "")}`);
    });
    const coverLocks = new Map();
    // 使用 protocol.handle 替代废弃的 registerFileProtocol，
    // 返回带 CORS 头的 Response，避免 Canvas tainting 导致取色失败
    protocol.handle("cover", async (request) => {
        const mediaItemId = Number(decodeURIComponent(request.url.replace(/^cover:\/\//, "")));
        if (!Number.isFinite(mediaItemId)) {
            return new Response("Invalid media item ID", { status: 400 });
        }
        const servePath = async (p) => {
            if (!fs.existsSync(p))
                return null;
            try {
                const buf = fs.readFileSync(p);
                const ext = path.extname(p).toLowerCase();
                const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
                return new Response(buf, {
                    headers: {
                        "content-type": mime,
                        "access-control-allow-origin": "*",
                        "cache-control": "public, max-age=86400",
                    },
                });
            }
            catch {
                return null;
            }
        };
        const cached = coverPathCache.get(mediaItemId);
        if (cached) {
            const resp = await servePath(cached);
            if (resp)
                return resp;
        }
        // Use a lock to prevent duplicate/concurrent downloads for the same ID
        let lock = coverLocks.get(mediaItemId);
        if (!lock) {
            lock = (async () => {
                try {
                    const coverPath = await resolveMediaCover(mediaItemId);
                    if (coverPath) {
                        coverPathCache.set(mediaItemId, coverPath);
                        return coverPath;
                    }
                }
                finally {
                    coverLocks.delete(mediaItemId);
                }
                return null;
            })();
            coverLocks.set(mediaItemId, lock);
        }
        const resolvedPath = await lock;
        if (resolvedPath) {
            const resp = await servePath(resolvedPath);
            if (resp)
                return resp;
        }
        return new Response("Cover not found", { status: 404 });
    });
    registerIpc();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
function registerIpc() {
    protocol.handle("online-image", async (request) => {
        const url = new URL(request.url).searchParams.get("url");
        const referer = new URL(request.url).searchParams.get("referer");
        if (!url)
            return new Response("Missing URL", { status: 400 });
        try {
            const response = await fetch(url, {
                headers: {
                    "Referer": referer || new URL(url).origin,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });
            const buffer = await response.arrayBuffer();
            return new Response(buffer, {
                headers: { "Content-Type": response.headers.get("Content-Type") || "image/jpeg" }
            });
        }
        catch (e) {
            return new Response(String(e), { status: 500 });
        }
    });
    ipcMain.handle("db:listMediaItems", () => listMediaItems());
    ipcMain.handle("sources:list", () => listSources());
    ipcMain.handle("sources:addLocal", async (_, name) => {
        const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        return addLocalSourceByPath(result.filePaths[0], name || path.basename(result.filePaths[0]));
    });
    ipcMain.handle("sources:addLocalPath", (_, rootPath, name) => addLocalSourceByPath(rootPath, name));
    ipcMain.handle("sources:addWebDav", (_, input) => addWebDavSourceAndTest(input));
    ipcMain.handle("sources:rename", (_, id, name) => renameSource(id, name));
    ipcMain.handle("sources:delete", (_, id) => deleteSource(id));
    ipcMain.handle("sources:scan", (_, sourceId) => {
        const source = listSources().find((item) => item.id === sourceId);
        if (source?.type === "webdav")
            return scanWebDavSource(sourceId, extensionList(getSettings().videoExtensions));
        return scanLocalSource(sourceId, extensionList(getSettings().videoExtensions));
    });
    ipcMain.handle("media:list", (_, args) => listMediaItems(args?.search || "", args?.sort || "created_at", args?.filter || "all", args?.sourceId));
    ipcMain.handle("media:get", (_, id) => ({ item: getMediaItem(id), files: listMediaFiles(id), candidates: listCandidates(id) }));
    ipcMain.handle("media:issues", (_, limit) => listScrapeIssues(limit));
    ipcMain.handle("media:watchStats", () => getWatchStats());
    ipcMain.handle("media:setStatus", (_, id, status) => setItemWatchStatus(id, status));
    ipcMain.handle("media:openFolder", async (_, folderPath) => {
        if (/^https?:\/\//i.test(folderPath)) {
            await shell.openExternal(folderPath);
            return "";
        }
        return shell.openPath(folderPath);
    });
    ipcMain.handle("media:recleanNames", () => recleanMediaItemNames());
    ipcMain.handle("files:play", (_, fileId) => playFile(fileId));
    ipcMain.handle("files:setWatched", (_, fileId, watched) => setFileWatched(fileId, watched));
    ipcMain.handle("files:setStatus", (_, fileId, status) => setFileStatus(fileId, status));
    ipcMain.handle("scraper:searchBangumi", (_, mediaItemId, keyword) => searchBangumi(mediaItemId, keyword));
    ipcMain.handle("scraper:applyBangumi", async (_, mediaItemId, externalId) => {
        const item = await applyBangumiCandidate(mediaItemId, externalId);
        coverPathCache.delete(mediaItemId);
        return item;
    });
    ipcMain.handle("scraper:getBangumiSubject", (_, subjectId) => getBangumiSubjectDetail(subjectId));
    ipcMain.handle("scraper:getAnimeByTag", (_, tag, offset, limit, options) => getAnimeByTag(tag, offset, limit, options));
    ipcMain.handle("scraper:getPopularTags", () => getPopularTags());
    ipcMain.handle("scraper:getPerson", (_, personId) => getBangumiPersonDetail(personId));
    ipcMain.handle("scraper:refreshBangumiById", async (_, mediaItemId) => {
        const item = await refreshBangumiById(mediaItemId);
        coverPathCache.delete(mediaItemId);
        return item;
    });
    ipcMain.handle("scraper:batchSearchBangumi", async (_, options) => {
        const result = await batchSearchBangumi(options);
        coverPathCache.clear();
        return result;
    });
    ipcMain.handle("scraper:batchRefreshBangumiById", async (_, options) => {
        const result = await batchRefreshBangumiById(options);
        coverPathCache.clear();
        return result;
    });
    ipcMain.handle("scraper:repairCoverCache", async () => {
        const result = await repairCoverCache();
        coverPathCache.clear();
        return result;
    });
    ipcMain.handle("scraper:clearCoverCache", () => {
        const result = clearCoverCache();
        coverPathCache.clear();
        return result;
    });
    ipcMain.handle("scraper:getBangumiCalendar", () => getBangumiCalendar());
    ipcMain.handle("bangumi:testToken", (_, token) => testBangumiToken(token));
    ipcMain.handle("bangumi:syncLocalStatus", () => syncLocalWatchStatusToBangumi());
    // New season API (Bangumi API driven, no scraping)
    ipcMain.handle("season:getAnime", (_, year, season, options) => getSeasonAnime(year, season, options));
    ipcMain.handle("season:getDetail", (_, bangumiId) => getBangumiSubjectDetail(String(bangumiId)));
    ipcMain.handle("season:getMikanResources", (_, keyword) => searchMikan(keyword));
    ipcMain.handle("online:listRules", () => listOnlineRules());
    ipcMain.handle("online:search", (_, input) => onlineSearch(input));
    ipcMain.handle("online:episodes", (_, input) => onlineEpisodes(input));
    ipcMain.handle("online:playUrl", async (_, url, title, referer, ruleInput, bangumiId) => {
        if (ruleInput?.ruleJson || ruleInput?.ruleUrl) {
            await sniffAndPlay({ ...ruleInput, url, title, bangumiId });
            return;
        }
        playUrl(url, title, referer, bangumiId);
    });
    ipcMain.handle("logs:list", (_, limit) => listLogs(limit));
    ipcMain.handle("settings:get", () => getSettings());
    ipcMain.handle("settings:set", (_, key, value) => setSetting(key, value));
    ipcMain.handle("sync:uploadWebDav", () => uploadWebDavSyncState());
    ipcMain.handle("sync:downloadWebDav", () => downloadWebDavSyncState());
    ipcMain.handle("subscriptions:list", () => subscriptionsList());
    ipcMain.handle("subscriptions:items", (_, subscriptionId) => subscriptionItems(subscriptionId));
    ipcMain.handle("subscriptions:add", (_, input) => subscriptionAdd(input));
    ipcMain.handle("subscriptions:delete", (_, id) => subscriptionDelete(id));
    ipcMain.handle("subscriptions:searchMikan", (_, keyword) => searchMikan(keyword));
    ipcMain.handle("subscriptions:getMikanBangumi", (_, bangumiId) => getMikanBangumi(bangumiId));
    ipcMain.handle("subscriptions:refresh", (_, id) => refreshSubscription(id));
    ipcMain.handle("subscriptions:refreshAll", () => refreshAllSubscriptions());
    ipcMain.handle("subscriptions:sendItem", (_, itemId) => sendRssItemToQbittorrent(itemId));
    ipcMain.handle("subscriptions:sendUrl", (_, url, savePath, title, seriesTitle) => sendUrlToQbittorrent(url, savePath, title, seriesTitle));
    ipcMain.handle("subscriptions:sendPending", (_, subscriptionId) => sendPendingItemsToQbittorrent(subscriptionId));
    ipcMain.handle("subscriptions:testQbittorrent", () => testQbittorrent());
    ipcMain.handle("cloudOffline:list123", () => listPan123OfflineTasks());
    ipcMain.handle("cloudOffline:submit123", (_, input) => submitPan123OfflineDownload(input));
    ipcMain.handle("cloudOffline:refresh123", (_, taskId) => refreshPan123OfflineTask(taskId));
    ipcMain.handle("cloudOffline:refreshAll123", () => refreshAllPan123OfflineTasks());
    ipcMain.handle("cloudOffline:listPikpak", () => listPikpakOfflineTasks());
    ipcMain.handle("cloudOffline:submitPikpak", (_, input) => submitPikpakOfflineDownload(input));
    ipcMain.handle("cloudOffline:refreshPikpak", () => refreshPikpakOfflineTasks());
    ipcMain.handle("settings:chooseMpv", async () => {
        const result = await dialog.showOpenDialog({
            title: "选择 mpv.exe",
            properties: ["openFile"],
            filters: [{ name: "mpv", extensions: ["exe"] }]
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        setSetting("mpvPath", result.filePaths[0]);
        return result.filePaths[0];
    });
    ipcMain.handle("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
    ipcMain.handle("window:maximize", (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win)
            return;
        if (win.isMaximized()) {
            win.unmaximize();
        }
        else {
            win.maximize();
        }
    });
    ipcMain.handle("window:close", (event) => BrowserWindow.fromWebContents(event.sender)?.close());
}
async function checkLibrariesOnStartup(win) {
    const sources = listSources();
    if (sources.length === 0) {
        await dialog.showMessageBox(win, {
            type: "info",
            title: "资源库检查",
            message: "无更新",
            detail: "还没有添加本地媒体库。"
        });
        return;
    }
    let changedSources = 0;
    let totalFiles = 0;
    let totalFolders = 0;
    let failed = 0;
    const errors = [];
    for (const source of sources) {
        try {
            const result = source.type === "webdav"
                ? await scanWebDavSource(source.id, extensionList(getSettings().videoExtensions))
                : await scanLocalSource(source.id, extensionList(getSettings().videoExtensions));
            totalFiles += result.files;
            totalFolders += result.folders;
            if (result.changed)
                changedSources += 1;
        }
        catch (error) {
            failed += 1;
            errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    if (changedSources > 0) {
        await dialog.showMessageBox(win, {
            type: "info",
            title: "资源库有更新",
            message: "资源库有更新",
            detail: `已扫描 ${sources.length} 个媒体库，${changedSources} 个有变化。\n当前共识别 ${totalFolders} 个条目、${totalFiles} 个视频文件。${failed ? `\n失败 ${failed} 个：\n${errors.join("\n")}` : ""}`
        });
    }
    else {
        await dialog.showMessageBox(win, {
            type: failed ? "warning" : "info",
            title: failed ? "资源库检查完成" : "资源库无更新",
            message: failed ? "资源库检查完成，但有失败项" : "无更新",
            detail: `已扫描 ${sources.length} 个媒体库，未发现新增、删除或修改的视频文件。${failed ? `\n失败 ${failed} 个：\n${errors.join("\n")}` : ""}`
        });
    }
}
function extensionList(value) {
    if (!value)
        return undefined;
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function renderFatalError(title, detail) {
    return `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101113; color: #f1f3f4; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
          main { width: min(760px, calc(100vw - 48px)); border: 1px solid #394148; border-radius: 8px; background: #171b1f; padding: 24px; }
          h1 { margin: 0 0 12px; font-size: 24px; }
          pre { white-space: pre-wrap; color: #f0a1a1; background: #21191b; border-radius: 8px; padding: 14px; }
        </style>
      </head>
      <body><main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(detail)}</pre></main></body>
    </html>
  `;
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}
