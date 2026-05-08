import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { cleanFolderName } from "./nameCleaner.js";
let db = null;
export const now = () => new Date().toISOString();
export function getUserDataPath() {
    const root = app.getPath("userData");
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, "cache", "posters"), { recursive: true });
    return root;
}
export function getDb() {
    if (!db) {
        const dbPath = path.join(getUserDataPath(), "library.sqlite");
        db = new Database(dbPath);
        db.pragma("foreign_keys = ON");
        db.pragma("journal_mode = WAL");
        db.pragma("synchronous = NORMAL");
        db.pragma("temp_store = MEMORY");
        db.pragma("mmap_size = 268435456");
        migrate(db);
    }
    return db;
}
function migrate(database) {
    database.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('local', 'webdav')),
      root_path TEXT NOT NULL,
      webdav_url TEXT,
      username TEXT,
      encrypted_password TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      clean_name TEXT NOT NULL,
      title TEXT,
      original_title TEXT,
      summary TEXT,
      cover_path TEXT,
      backdrop_path TEXT,
      media_type TEXT NOT NULL DEFAULT 'anime',
      year INTEGER,
      air_date TEXT,
      rating REAL,
      rank INTEGER,
      metadata_json TEXT,
      tags_json TEXT,
      staff_json TEXT,
      characters_json TEXT,
      relations_json TEXT,
      provider TEXT,
      external_id TEXT,
      watch_status TEXT NOT NULL DEFAULT 'unwatched',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_scanned_at TEXT,
      last_played_at TEXT,
      UNIQUE(source_id, folder_path)
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime TEXT NOT NULL,
      duration REAL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      watched INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_position REAL,
      last_played_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(media_item_id, file_path)
    );

    CREATE TABLE IF NOT EXISTS metadata_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      original_title TEXT,
      year INTEGER,
      score REAL,
      cover_url TEXT,
      match_score REAL,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(media_item_id, provider, external_id)
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER REFERENCES media_items(id) ON DELETE CASCADE,
      media_file_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
      online_title TEXT,
      bangumi_id TEXT,
      played_at TEXT NOT NULL,
      duration REAL,
      position REAL,
      completed INTEGER NOT NULL DEFAULT 0,
      player TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      module TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      media_item_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      feed_url TEXT NOT NULL,
      keyword TEXT,
      save_path TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL REFERENCES rss_subscriptions(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle_group TEXT,
      size_text TEXT,
      updated_at_text TEXT,
      link TEXT,
      torrent_url TEXT,
      magnet_url TEXT,
      pub_date TEXT,
      downloaded INTEGER NOT NULL DEFAULT 0,
      download_status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subscription_id, guid)
    );

    CREATE TABLE IF NOT EXISTS cloud_offline_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      source_title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      task_id TEXT NOT NULL,
      target_dir_id TEXT,
      progress REAL,
      status TEXT,
      error_message TEXT,
      raw_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider, task_id)
    );

    CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title, clean_name, folder_name);
    CREATE INDEX IF NOT EXISTS idx_media_items_source ON media_items(source_id, folder_path);
    CREATE INDEX IF NOT EXISTS idx_media_items_status ON media_items(watch_status);
    CREATE INDEX IF NOT EXISTS idx_media_items_external ON media_items(provider, external_id);
    CREATE INDEX IF NOT EXISTS idx_media_files_item ON media_files(media_item_id);
    CREATE INDEX IF NOT EXISTS idx_media_files_item_path ON media_files(media_item_id, file_path);
    CREATE INDEX IF NOT EXISTS idx_candidates_item ON metadata_candidates(media_item_id, provider, external_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON app_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rss_items_subscription ON rss_items(subscription_id, pub_date DESC);
    CREATE INDEX IF NOT EXISTS idx_rss_items_status ON rss_items(download_status, downloaded);
    CREATE INDEX IF NOT EXISTS idx_cloud_offline_provider ON cloud_offline_tasks(provider, updated_at DESC);

    CREATE TABLE IF NOT EXISTS bangumi_season_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      season TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(year, season)
    );
  `);
    ensureColumn(database, "media_items", "metadata_json", "TEXT");
    ensureColumn(database, "media_items", "tags_json", "TEXT");
    ensureColumn(database, "media_items", "staff_json", "TEXT");
    ensureColumn(database, "media_items", "characters_json", "TEXT");
    ensureColumn(database, "media_items", "relations_json", "TEXT");
    ensureColumn(database, "rss_items", "subtitle_group", "TEXT");
    ensureColumn(database, "rss_items", "size_text", "TEXT");
    ensureColumn(database, "rss_items", "updated_at_text", "TEXT");
    ensureColumn(database, "watch_history", "online_title", "TEXT");
    ensureColumn(database, "watch_history", "bangumi_id", "TEXT");
}
export function listCloudOfflineTasks(limit = 100) {
    return getDb()
        .prepare("SELECT * FROM cloud_offline_tasks ORDER BY updated_at DESC LIMIT ?")
        .all(limit);
}
export function addCloudOfflineTask(input) {
    getDb()
        .prepare(`
      INSERT INTO cloud_offline_tasks (provider, source_title, source_url, task_id, target_dir_id, progress, status, error_message, raw_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, task_id) DO UPDATE SET
        source_title = excluded.source_title,
        source_url = excluded.source_url,
        target_dir_id = excluded.target_dir_id,
        progress = excluded.progress,
        status = excluded.status,
        error_message = excluded.error_message,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `)
        .run(input.provider, input.sourceTitle, input.sourceUrl, input.taskId, input.targetDirId || null, input.progress ?? null, input.status || null, input.errorMessage || null, input.rawJson || null, now(), now());
    return getCloudOfflineTask(input.provider, input.taskId);
}
export function updateCloudOfflineTask(provider, taskId, patch) {
    getDb()
        .prepare(`
      UPDATE cloud_offline_tasks
      SET progress = COALESCE(?, progress),
          status = COALESCE(?, status),
          error_message = ?,
          raw_json = COALESCE(?, raw_json),
          updated_at = ?
      WHERE provider = ? AND task_id = ?
    `)
        .run(patch.progress ?? null, patch.status ?? null, patch.errorMessage ?? null, patch.rawJson ?? null, now(), provider, taskId);
    return getCloudOfflineTask(provider, taskId);
}
export function getCloudOfflineTask(provider, taskId) {
    return getDb().prepare("SELECT * FROM cloud_offline_tasks WHERE provider = ? AND task_id = ?").get(provider, taskId);
}
export function listRssSubscriptions() {
    return getDb()
        .prepare(`
      SELECT rs.*,
        COUNT(ri.id) AS item_count,
        SUM(CASE WHEN ri.download_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN ri.downloaded = 1 THEN 1 ELSE 0 END) AS downloaded_count
      FROM rss_subscriptions rs
      LEFT JOIN rss_items ri ON ri.subscription_id = rs.id
      GROUP BY rs.id
      ORDER BY rs.created_at DESC
    `)
        .all();
}
export function getRssSubscription(id) {
    return getDb().prepare("SELECT * FROM rss_subscriptions WHERE id = ?").get(id);
}
export function addRssSubscription(input) {
    const name = input.name.trim();
    const feedUrl = input.feedUrl?.trim() || buildMikanSearchFeed(input.keyword || name);
    if (!name)
        throw new Error("订阅名称不能为空");
    if (!feedUrl)
        throw new Error("RSS 地址不能为空");
    const result = getDb()
        .prepare(`
      INSERT INTO rss_subscriptions (name, feed_url, keyword, save_path, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `)
        .run(name, feedUrl, input.keyword?.trim() || null, input.savePath?.trim() || null, now(), now());
    log("info", "subscription", `添加 RSS 订阅：${name}`, feedUrl);
    return getRssSubscription(Number(result.lastInsertRowid));
}
export function updateRssSubscription(id, patch) {
    const existing = getRssSubscription(id);
    if (!existing)
        throw new Error("订阅不存在");
    const nextName = patch.name?.trim() || existing.name;
    const nextFeedUrl = patch.feedUrl?.trim() || existing.feed_url;
    getDb()
        .prepare(`
      UPDATE rss_subscriptions
      SET name = ?, feed_url = ?, keyword = ?, save_path = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `)
        .run(nextName, nextFeedUrl, patch.keyword !== undefined ? patch.keyword.trim() || null : existing.keyword, patch.savePath !== undefined ? patch.savePath.trim() || null : existing.save_path, patch.enabled ?? existing.enabled, now(), id);
    return getRssSubscription(id);
}
export function deleteRssSubscription(id) {
    const existing = getRssSubscription(id);
    const result = getDb().prepare("DELETE FROM rss_subscriptions WHERE id = ?").run(id);
    if (existing)
        log("info", "subscription", `删除 RSS 订阅：${existing.name}`, existing.feed_url);
    return { deleted: result.changes };
}
export function listRssItems(subscriptionId, limit = 200) {
    const where = subscriptionId ? "WHERE subscription_id = ?" : "";
    const params = subscriptionId ? [subscriptionId, limit] : [limit];
    return getDb()
        .prepare(`SELECT * FROM rss_items ${where} ORDER BY COALESCE(pub_date, created_at) DESC LIMIT ?`)
        .all(...params);
}
export function upsertRssItems(subscriptionId, items) {
    const stmt = getDb().prepare(`
    INSERT INTO rss_items (subscription_id, guid, title, subtitle_group, size_text, updated_at_text, link, torrent_url, magnet_url, pub_date, raw_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(subscription_id, guid) DO UPDATE SET
      title = excluded.title,
      subtitle_group = excluded.subtitle_group,
      size_text = excluded.size_text,
      updated_at_text = excluded.updated_at_text,
      link = excluded.link,
      torrent_url = excluded.torrent_url,
      magnet_url = excluded.magnet_url,
      pub_date = excluded.pub_date,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);
    let inserted = 0;
    getDb().transaction(() => {
        for (const item of items) {
            const result = stmt.run(subscriptionId, item.guid, item.title, item.subtitle_group || null, item.size_text || null, item.updated_at_text || null, item.link || null, item.torrent_url || null, item.magnet_url || null, item.pub_date || null, item.raw_json || null, now(), now());
            if (result.changes > 0)
                inserted += 1;
        }
        getDb().prepare("UPDATE rss_subscriptions SET last_checked_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), subscriptionId);
    })();
    return inserted;
}
export function markRssItemDownloadResult(itemId, success, error) {
    getDb()
        .prepare("UPDATE rss_items SET downloaded = ?, download_status = ?, error_message = ?, updated_at = ? WHERE id = ?")
        .run(success ? 1 : 0, success ? "sent" : "failed", error || null, now(), itemId);
}
export function getRssItem(itemId) {
    return getDb().prepare("SELECT * FROM rss_items WHERE id = ?").get(itemId);
}
function buildMikanSearchFeed(keyword) {
    const query = keyword.trim();
    if (!query)
        return "";
    return `https://mikanani.me/RSS/Search?searchstr=${encodeURIComponent(query)}`;
}
function ensureColumn(database, table, column, type) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
}
export function log(level, module, message, detail, mediaItemId) {
    const detailText = detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail);
    getDb()
        .prepare("INSERT INTO app_logs (level, module, message, detail, media_item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(level, module, message, detailText, mediaItemId ?? null, now());
}
export function addLocalSource(name, rootPath) {
    const existing = getDb().prepare("SELECT * FROM sources WHERE type = 'local' AND root_path = ?").get(rootPath);
    if (existing) {
        log("info", "database", `媒体库已存在：${existing.name}`, rootPath);
        return existing;
    }
    const result = getDb()
        .prepare("INSERT INTO sources (name, type, root_path, created_at, updated_at) VALUES (?, 'local', ?, ?, ?)")
        .run(name, rootPath, now(), now());
    log("info", "database", `添加本地媒体库：${name}`, rootPath);
    return getSource(Number(result.lastInsertRowid));
}
export function addLocalSourceByPath(rootPath, name) {
    const resolved = path.resolve(rootPath.trim());
    if (!fs.existsSync(resolved)) {
        log("error", "scanner", `添加媒体库失败，路径不存在：${resolved}`);
        throw new Error(`路径不存在：${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        log("error", "scanner", `添加媒体库失败，不是文件夹：${resolved}`);
        throw new Error(`不是文件夹：${resolved}`);
    }
    const existingSources = listSources().filter((source) => source.type === "local");
    const duplicate = existingSources.find((source) => samePath(source.root_path, resolved));
    if (duplicate) {
        log("info", "database", `媒体库已存在：${duplicate.name}`, resolved);
        return duplicate;
    }
    const parentSource = existingSources.find((source) => isPathInside(resolved, source.root_path));
    if (parentSource) {
        throw new Error(`这个路径已经在媒体库「${parentSource.name}」下面：${parentSource.root_path}\n建议扫描原媒体库，或先删除旧来源后再单独添加。`);
    }
    const childSource = existingSources.find((source) => isPathInside(source.root_path, resolved));
    if (childSource) {
        throw new Error(`这个路径包含已有媒体库「${childSource.name}」：${childSource.root_path}\n请先删除被包含的旧来源，避免同一批文件重复入库。`);
    }
    return addLocalSource(name?.trim() || path.basename(resolved) || resolved, resolved);
}
export function addWebDavSource(input) {
    const name = input.name.trim();
    const webdavUrl = normalizeWebDavUrl(input.webdavUrl);
    const rootPath = normalizeWebDavPath(input.rootPath || "/");
    if (!name)
        throw new Error("WebDAV 显示名称不能为空");
    if (!webdavUrl)
        throw new Error("WebDAV 地址不能为空");
    const existing = getDb()
        .prepare("SELECT * FROM sources WHERE type = 'webdav' AND webdav_url = ? AND root_path = ?")
        .get(webdavUrl, rootPath);
    if (existing)
        return existing;
    const result = getDb()
        .prepare(`
      INSERT INTO sources (name, type, root_path, webdav_url, username, encrypted_password, created_at, updated_at)
      VALUES (?, 'webdav', ?, ?, ?, ?, ?, ?)
    `)
        .run(name, rootPath, webdavUrl, input.username?.trim() || null, input.password || null, now(), now());
    log("info", "webdav", `添加 WebDAV 媒体库：${name}`, `${webdavUrl}${rootPath}`);
    return getSource(Number(result.lastInsertRowid));
}
function normalizeWebDavUrl(value) {
    return value.trim().replace(/[\\\/]+$/, "");
}
function normalizeWebDavPath(value) {
    const trimmed = value.trim() || "/";
    const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}
function normalizeFsPath(targetPath) {
    return path.resolve(targetPath).toLowerCase().replace(/[\\\/]+$/, "");
}
function samePath(left, right) {
    return normalizeFsPath(left) === normalizeFsPath(right);
}
function isPathInside(child, parent) {
    const relative = path.relative(normalizeFsPath(parent), normalizeFsPath(child));
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
export function listSources() {
    return getDb().prepare("SELECT * FROM sources ORDER BY created_at DESC").all();
}
export function getSource(id) {
    return getDb().prepare("SELECT * FROM sources WHERE id = ?").get(id);
}
export function renameSource(id, name) {
    const trimmed = name.trim();
    if (!trimmed)
        throw new Error("媒体库名称不能为空");
    getDb().prepare("UPDATE sources SET name = ?, updated_at = ? WHERE id = ?").run(trimmed, now(), id);
    log("info", "database", `重命名媒体库：${trimmed}`, undefined, id);
    return getSource(id);
}
export function deleteSource(id) {
    const source = getSource(id);
    if (!source)
        return { deleted: 0 };
    const result = getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
    log("info", "database", `删除媒体库：${source.name}`, source.root_path);
    return { deleted: result.changes };
}
export function listMediaItems(search = "", sort = "created_at", filter = "all", sourceId) {
    const wheres = [];
    const params = [];
    if (search.trim()) {
        wheres.push("(COALESCE(title, '') LIKE ? OR COALESCE(original_title, '') LIKE ? OR folder_name LIKE ? OR clean_name LIKE ? OR folder_path LIKE ?)");
        const like = `%${search.trim()}%`;
        params.push(like, like, like, like, like);
    }
    if (sourceId) {
        wheres.push("mi.source_id = ?");
        params.push(sourceId);
    }
    if (["unwatched", "watching", "watched", "on_hold", "dropped"].includes(filter)) {
        wheres.push("watch_status = ?");
        params.push(filter);
    }
    else if (filter === "unmatched") {
        wheres.push("(external_id IS NULL OR external_id = '')");
    }
    else if (filter === "needs_confirm") {
        wheres.push("(external_id IS NULL OR external_id = '') AND EXISTS (SELECT 1 FROM metadata_candidates mc WHERE mc.media_item_id = mi.id)");
    }
    const orderMap = {
        title: "COALESCE(title, clean_name, folder_name) COLLATE NOCASE ASC",
        rating: "mi.rating DESC NULLS LAST",
        created_at: "mi.created_at DESC",
        last_played_at: "mi.last_played_at DESC NULLS LAST",
        last_scanned_at: "mi.last_scanned_at DESC NULLS LAST",
        file_count: "file_count DESC"
    };
    const sql = `
    SELECT mi.*,
      COUNT(mf.id) AS file_count,
      SUM(CASE WHEN mf.watched = 0 OR mf.watched = 'unwatched' THEN 1 ELSE 0 END) AS unwatched_count
    FROM media_items mi
    LEFT JOIN media_files mf ON mf.media_item_id = mi.id
    ${wheres.length ? `WHERE ${wheres.join(" AND ")}` : ""}
    GROUP BY mi.id
    ORDER BY ${orderMap[sort] ?? orderMap.created_at}
  `;
    return getDb().prepare(sql).all(...params);
}
export function getMediaItem(id) {
    return getDb()
        .prepare(`
      SELECT mi.*,
        COUNT(mf.id) AS file_count,
        SUM(CASE WHEN mf.watched = 0 OR mf.watched = 'unwatched' THEN 1 ELSE 0 END) AS unwatched_count
      FROM media_items mi
      LEFT JOIN media_files mf ON mf.media_item_id = mi.id
      WHERE mi.id = ?
      GROUP BY mi.id
    `)
        .get(id);
}
export function getCoverRecord(mediaItemId) {
    return getDb()
        .prepare(`
      SELECT mi.id, mi.cover_path, mi.external_id, mi.provider, mc.cover_url
      FROM media_items mi
      LEFT JOIN metadata_candidates mc
        ON mc.media_item_id = mi.id AND mc.provider = mi.provider AND mc.external_id = mi.external_id
      WHERE mi.id = ?
    `)
        .get(mediaItemId);
}
export function updateCoverPath(mediaItemId, coverPath) {
    getDb().prepare("UPDATE media_items SET cover_path = ?, updated_at = ? WHERE id = ?").run(coverPath, now(), mediaItemId);
}
export function clearCoverPaths() {
    const result = getDb().prepare("UPDATE media_items SET cover_path = NULL, updated_at = ? WHERE cover_path IS NOT NULL").run(now());
    log("info", "database", `已清空数据库封面路径：${result.changes} 个条目`);
    return result.changes;
}
export function repairMissingCovers() {
    const rows = getDb()
        .prepare(`
      SELECT mi.id, mi.cover_path, mi.external_id, mc.cover_url
      FROM media_items mi
      LEFT JOIN metadata_candidates mc
        ON mc.media_item_id = mi.id AND mc.provider = mi.provider AND mc.external_id = mi.external_id
      WHERE mi.provider = 'bangumi' AND mi.external_id IS NOT NULL
    `)
        .all();
    const missing = rows.filter((row) => !row.cover_path || !fs.existsSync(row.cover_path));
    log("info", "database", `检查封面缓存：${missing.length}/${rows.length} 个需要修复`);
    return missing;
}
export function listMediaFiles(mediaItemId) {
    return getDb()
        .prepare("SELECT * FROM media_files WHERE media_item_id = ? ORDER BY sort_index ASC, file_name ASC")
        .all(mediaItemId);
}
export function exportLibrarySyncState() {
    const items = getDb()
        .prepare("SELECT * FROM media_items ORDER BY id")
        .all();
    const filesStmt = getDb().prepare("SELECT * FROM media_files WHERE media_item_id = ? ORDER BY sort_index ASC, file_name ASC");
    const history = getDb()
        .prepare(`
      SELECT mi.provider, mi.external_id, mi.folder_name, mf.file_name, wh.played_at, wh.duration, wh.position, wh.completed, wh.player
      FROM watch_history wh
      JOIN media_items mi ON mi.id = wh.media_item_id
      JOIN media_files mf ON mf.id = wh.media_file_id
      ORDER BY wh.played_at ASC
    `)
        .all();
    return {
        version: 1,
        exported_at: now(),
        items: items.map((item) => ({
            provider: item.provider,
            external_id: item.external_id,
            folder_name: item.folder_name,
            clean_name: item.clean_name,
            watch_status: item.watch_status,
            updated_at: item.updated_at,
            files: filesStmt.all(item.id).map((file) => ({
                file_name: file.file_name,
                watched: file.watched,
                play_count: Number(file.play_count || 0),
                last_position: file.last_position,
                duration: file.duration,
                last_played_at: file.last_played_at,
                updated_at: file.updated_at
            }))
        })),
        history
    };
}
export function importLibrarySyncState(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.items))
        throw new Error("同步文件格式不正确");
    const findItemByExternal = getDb().prepare("SELECT * FROM media_items WHERE provider = ? AND external_id = ? LIMIT 1");
    const findItemByName = getDb().prepare("SELECT * FROM media_items WHERE clean_name = ? OR folder_name = ? LIMIT 1");
    const findFile = getDb().prepare("SELECT * FROM media_files WHERE media_item_id = ? AND file_name = ? LIMIT 1");
    const updateItem = getDb().prepare("UPDATE media_items SET watch_status = ?, updated_at = ? WHERE id = ?");
    const updateFile = getDb().prepare(`
    UPDATE media_files
    SET watched = ?, play_count = MAX(play_count, ?), last_position = COALESCE(?, last_position), duration = COALESCE(?, duration),
        last_played_at = COALESCE(?, last_played_at), updated_at = ?
    WHERE id = ?
  `);
    const existingHistory = getDb().prepare("SELECT id FROM watch_history WHERE media_file_id = ? AND played_at = ? LIMIT 1");
    const insertHistory = getDb().prepare(`
    INSERT INTO watch_history (media_item_id, media_file_id, played_at, duration, position, completed, player)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    let itemCount = 0;
    let fileCount = 0;
    let historyCount = 0;
    getDb().transaction(() => {
        for (const incoming of state.items) {
            const item = findMatchingItem(incoming, findItemByExternal, findItemByName);
            if (!item)
                continue;
            if (new Date(incoming.updated_at).getTime() >= new Date(item.updated_at).getTime()) {
                updateItem.run(incoming.watch_status, now(), item.id);
                itemCount += 1;
            }
            for (const incomingFile of incoming.files || []) {
                const file = findFile.get(item.id, incomingFile.file_name);
                if (!file)
                    continue;
                if (new Date(incomingFile.updated_at).getTime() >= new Date(file.updated_at).getTime()) {
                    updateFile.run(incomingFile.watched, incomingFile.play_count || 0, incomingFile.last_position ?? null, incomingFile.duration ?? null, incomingFile.last_played_at ?? null, now(), file.id);
                    fileCount += 1;
                }
            }
        }
        for (const incomingHistory of state.history || []) {
            const item = findMatchingItem(incomingHistory, findItemByExternal, findItemByName);
            if (!item)
                continue;
            const file = findFile.get(item.id, incomingHistory.file_name);
            if (!file)
                continue;
            if (existingHistory.get(file.id, incomingHistory.played_at))
                continue;
            insertHistory.run(item.id, file.id, incomingHistory.played_at, incomingHistory.duration ?? null, incomingHistory.position ?? null, incomingHistory.completed ? 1 : 0, incomingHistory.player || "mpv");
            historyCount += 1;
        }
    })();
    log("info", "webdav", `WebDAV 同步导入完成：${itemCount} 个条目、${fileCount} 个文件、${historyCount} 条历史`);
    return { items: itemCount, files: fileCount, histories: historyCount };
}
function findMatchingItem(incoming, findItemByExternal, findItemByName) {
    if (incoming.provider && incoming.external_id) {
        const byExternal = findItemByExternal.get(incoming.provider, incoming.external_id);
        if (byExternal)
            return byExternal;
    }
    return findItemByName.get(incoming.clean_name || incoming.folder_name, incoming.folder_name);
}
export function listCandidates(mediaItemId) {
    return getDb()
        .prepare("SELECT * FROM metadata_candidates WHERE media_item_id = ? ORDER BY match_score DESC NULLS LAST, score DESC NULLS LAST")
        .all(mediaItemId);
}
export function listLogs(limit = 300) {
    return getDb().prepare("SELECT * FROM app_logs ORDER BY created_at DESC LIMIT ?").all(limit);
}
export function listScrapeIssues(limit = 8) {
    return getDb()
        .prepare(`
      SELECT
        mi.id,
        mi.title,
        mi.clean_name,
        mi.folder_name,
        mi.folder_path,
        COUNT(mc.id) AS candidate_count,
        (
          SELECT al.message
          FROM app_logs al
          WHERE al.media_item_id = mi.id AND al.module = 'scraper' AND al.level IN ('warning', 'error')
          ORDER BY al.created_at DESC
          LIMIT 1
        ) AS last_error
      FROM media_items mi
      LEFT JOIN metadata_candidates mc ON mc.media_item_id = mi.id
      WHERE (
        mi.external_id IS NULL 
        OR mi.external_id = '' 
        OR (mi.title IS NULL OR mi.title = '')
        OR (mi.summary IS NULL OR mi.summary = '')
        OR (mi.cover_path IS NULL OR mi.cover_path = '')
      )
      GROUP BY mi.id
      ORDER BY candidate_count DESC, mi.updated_at DESC
      LIMIT ?
    `)
        .all(limit);
}
export function getWatchStats() {
    const row = getDb()
        .prepare(`
      SELECT
        SUM(CASE WHEN date(played_at, 'localtime') = date('now', 'localtime') THEN COALESCE(duration, 0) ELSE 0 END) AS today_seconds,
        SUM(CASE WHEN datetime(played_at) >= datetime('now', '-7 days') THEN COALESCE(duration, 0) ELSE 0 END) AS week_seconds,
        SUM(COALESCE(duration, 0)) AS total_seconds,
        SUM(CASE WHEN date(played_at, 'localtime') = date('now', 'localtime') THEN 1 ELSE 0 END) AS today_count,
        COUNT(*) AS total_count,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS completed_count
      FROM watch_history
    `)
        .get();
    const recent = getDb()
        .prepare(`
      SELECT
        wh.id,
        COALESCE(mi.title, mi.clean_name, mi.folder_name, wh.online_title) AS title,
        COALESCE(mf.file_name, '在线播放') AS file_name,
        wh.played_at,
        wh.duration
      FROM watch_history wh
      LEFT JOIN media_items mi ON mi.id = wh.media_item_id
      LEFT JOIN media_files mf ON mf.id = wh.media_file_id
      ORDER BY wh.played_at DESC
      LIMIT 10
    `)
        .all();
    const daily = getDb()
        .prepare(`
      SELECT
        date(played_at, 'localtime') AS date,
        SUM(COALESCE(duration, 0)) AS seconds,
        COUNT(*) AS count
      FROM watch_history
      WHERE datetime(played_at) >= datetime('now', '-13 days')
      GROUP BY date(played_at, 'localtime')
      ORDER BY date ASC
    `)
        .all();
    const topTitles = getDb()
        .prepare(`
      SELECT
        COALESCE(mi.id, wh.bangumi_id, wh.online_title) AS media_item_id,
        COALESCE(mi.title, mi.clean_name, mi.folder_name, wh.online_title) AS title,
        SUM(COALESCE(wh.duration, 0)) AS seconds,
        COUNT(*) AS count
      FROM watch_history wh
      LEFT JOIN media_items mi ON mi.id = wh.media_item_id
      GROUP BY media_item_id
      ORDER BY seconds DESC
      LIMIT 10
    `)
        .all();
    const statusCounts = getDb()
        .prepare(`
      SELECT watch_status AS status, COUNT(*) AS count
      FROM media_items
      GROUP BY watch_status
      ORDER BY count DESC
    `)
        .all();
    return {
        today_seconds: Number(row.today_seconds || 0),
        week_seconds: Number(row.week_seconds || 0),
        total_seconds: Number(row.total_seconds || 0),
        today_count: Number(row.today_count || 0),
        total_count: Number(row.total_count || 0),
        completed_count: Number(row.completed_count || 0),
        recent,
        daily: daily.map((item) => ({ ...item, seconds: Number(item.seconds || 0), count: Number(item.count || 0) })),
        top_titles: topTitles.map((item) => ({ ...item, seconds: Number(item.seconds || 0), count: Number(item.count || 0) })),
        status_counts: statusCounts.map((item) => ({ ...item, count: Number(item.count || 0) }))
    };
}
export function recleanMediaItemNames() {
    const rows = getDb().prepare("SELECT id, folder_name, clean_name FROM media_items").all();
    const update = getDb().prepare("UPDATE media_items SET clean_name = ?, updated_at = ? WHERE id = ?");
    let changed = 0;
    const transaction = getDb().transaction(() => {
        for (const row of rows) {
            const clean = cleanFolderName(row.folder_name);
            if (clean !== row.clean_name) {
                update.run(clean, now(), row.id);
                changed += 1;
            }
        }
    });
    transaction();
    log("info", "database", `重算清洗标题完成：${changed}/${rows.length} 个条目已更新`);
    return { total: rows.length, changed };
}
export function getSettings() {
    const rows = getDb().prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
export function setSetting(key, value) {
    getDb()
        .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
        .run(key, value, now());
    log("info", "database", `保存设置：${key}`, key.toLowerCase().includes("password") ? "<hidden>" : value);
}
