import fs from "node:fs";
import path from "node:path";
import { clearCoverPaths, getCoverRecord, getDb, getMediaItem, getUserDataPath, listMediaItems, log, now, repairMissingCovers, updateCoverPath } from "./db.js";
import { simpleMatchScore } from "./nameCleaner.js";
import { normalizeBangumiSubject } from "./bangumiSeason.js";
export async function searchBangumi(mediaItemId, keyword, enrichDetails = true) {
    const item = getMediaItem(mediaItemId);
    if (!item)
        throw new Error(`Media item ${mediaItemId} not found`);
    const query = (keyword || item.clean_name || item.folder_name).trim();
    const response = await fetch("https://api.bgm.tv/v0/search/subjects", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)"
        },
        body: JSON.stringify({
            keyword: query,
            sort: "match",
            filter: { type: [2] }
        })
    });
    if (!response.ok) {
        log("error", "scraper", `Bangumi 搜索失败：${query}`, await response.text(), mediaItemId);
        throw new Error(`Bangumi search failed: ${response.status}`);
    }
    const json = await response.json();
    const rawSubjects = (json.data || []).slice(0, 12);
    const detailLimit = enrichDetails ? Math.min(8, rawSubjects.length) : 0;
    const detailedSubjects = {};
    for (const subject of rawSubjects.slice(0, detailLimit)) {
        const id = String(subject.id);
        const detail = await fetchBangumiSubjectDetail(id);
        if (detail)
            detailedSubjects[id] = detail;
        await delay(180);
    }
    const candidates = rawSubjects.map((subject) => normalizeCandidate(detailedSubjects[String(subject.id)] || subject, query));
    const db = getDb();
    const stmt = db.prepare(`
    INSERT INTO metadata_candidates (media_item_id, provider, external_id, title, original_title, year, score, cover_url, match_score, raw_json, created_at)
    VALUES (?, 'bangumi', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_item_id, provider, external_id) DO UPDATE SET
      title = excluded.title,
      original_title = excluded.original_title,
      year = excluded.year,
      score = excluded.score,
      cover_url = excluded.cover_url,
      match_score = excluded.match_score,
      raw_json = excluded.raw_json
  `);
    const transaction = db.transaction(() => {
        for (const candidate of candidates) {
            stmt.run(mediaItemId, candidate.external_id, candidate.title, candidate.original_title, candidate.year, candidate.score, candidate.cover_url, candidate.match_score, candidate.raw_json, now());
        }
    });
    transaction();
    log("info", "scraper", `Bangumi 搜索完成：${query}，候选 ${candidates.length} 个`, undefined, mediaItemId);
    return candidates;
}
export async function batchSearchBangumi(options) {
    const unmatchedOnly = options?.unmatchedOnly ?? true;
    const threshold = options?.autoApplyThreshold ?? 92;
    const delayMs = options?.delayMs ?? 1100;
    const allItems = listMediaItems("", "created_at", unmatchedOnly ? "unmatched" : "all");
    const items = allItems.filter((item) => item.clean_name && (!unmatchedOnly || !item.external_id));
    const result = { total: items.length, searched: 0, autoApplied: 0, needConfirm: 0, failed: 0 };
    log("info", "scraper", `开始批量 Bangumi 刮削：${items.length} 个条目，自动应用阈值 ${threshold}`);
    for (const item of items) {
        try {
            const candidates = await searchBangumi(item.id, item.clean_name, false);
            result.searched += 1;
            const best = bestCandidate(candidates, item);
            if (best && (best.match_score ?? 0) >= threshold) {
                await applyBangumiCandidate(item.id, best.external_id);
                result.autoApplied += 1;
            }
            else if (candidates.length > 0) {
                result.needConfirm += 1;
            }
            else {
                result.failed += 1;
            }
            if (result.searched % 10 === 0) {
                log("info", "scraper", `批量刮削进度：${result.searched}/${result.total}，自动应用 ${result.autoApplied}，待确认 ${result.needConfirm}，失败 ${result.failed}`);
            }
        }
        catch (error) {
            result.failed += 1;
            log("error", "scraper", `批量刮削失败：${item.clean_name}`, error instanceof Error ? error.message : String(error), item.id);
        }
        await delay(delayMs);
    }
    log("info", "scraper", `批量 Bangumi 刮削完成：搜索 ${result.searched}/${result.total}，自动应用 ${result.autoApplied}，待确认 ${result.needConfirm}，失败 ${result.failed}`);
    return result;
}
export async function batchRefreshBangumiById(options) {
    const delayMs = options?.delayMs ?? 900;
    const items = listMediaItems("", "created_at", "all").filter((item) => item.provider === "bangumi" && item.external_id);
    const result = { total: items.length, refreshed: 0, failed: 0 };
    log("info", "scraper", `开始按 Bangumi ID 批量刷新：${items.length} 个条目`);
    for (const item of items) {
        try {
            await refreshBangumiById(item.id);
            result.refreshed += 1;
            if (result.refreshed % 10 === 0) {
                log("info", "scraper", `按 ID 刷新进度：${result.refreshed + result.failed}/${result.total}，成功 ${result.refreshed}，失败 ${result.failed}`);
            }
        }
        catch (error) {
            result.failed += 1;
            log("error", "scraper", `按 Bangumi ID 刷新失败：${item.title || item.clean_name}`, error instanceof Error ? error.message : String(error), item.id);
        }
        await delay(delayMs);
    }
    log("info", "scraper", `按 Bangumi ID 批量刷新完成：成功 ${result.refreshed}/${result.total}，失败 ${result.failed}`);
    return result;
}
function bestCandidate(candidates, item) {
    return [...candidates].sort((a, b) => {
        const byMatch = (b.match_score ?? 0) - (a.match_score ?? 0);
        if (byMatch !== 0)
            return byMatch;
        return (b.score ?? 0) - (a.score ?? 0);
    }).find((candidate) => {
        const exact = [candidate.title, candidate.original_title].some((title) => simpleMatchScore(item.clean_name, title || "") >= 98);
        return exact || (candidate.match_score ?? 0) >= 86;
    });
}
function normalizeCandidate(subject, query) {
    const images = subject.images;
    const rating = subject.rating;
    const date = String(subject.date || subject.air_date || "");
    const title = String(subject.name_cn || subject.name || "");
    const originalTitle = String(subject.name || "");
    const aliases = extractAliases(subject.infobox);
    const matchScore = Math.max(simpleMatchScore(query, title), simpleMatchScore(query, originalTitle), ...aliases.map((alias) => simpleMatchScore(query, alias)));
    return {
        external_id: String(subject.id),
        title,
        original_title: originalTitle,
        year: date ? Number(date.slice(0, 4)) || null : null,
        score: rating?.score ?? null,
        cover_url: normalizeImageUrl(images?.large || images?.common || images?.medium || images?.grid || null),
        summary: String(subject.summary || ""),
        rank: rating?.rank ?? null,
        air_date: date || null,
        match_score: matchScore,
        raw_json: JSON.stringify(subject)
    };
}
async function fetchBangumiSubjectDetail(subjectId) {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`, {
        headers: {
            "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)"
        }
    });
    if (!response.ok) {
        log("warning", "scraper", `Bangumi 详情获取失败：${subjectId}`, `${response.status} ${await response.text()}`);
        return null;
    }
    return await response.json();
}
function extractAliases(infobox) {
    if (!Array.isArray(infobox))
        return [];
    return infobox
        .filter((entry) => String(entry.key || "").includes("别名"))
        .flatMap((entry) => Array.isArray(entry.value) ? entry.value : [entry.value])
        .map((value) => typeof value === "object" && value !== null && "v" in value ? String(value.v) : String(value || ""))
        .filter(Boolean);
}
function normalizeImageUrl(url) {
    if (!url)
        return null;
    return url.replace(/^http:\/\/lain\.bgm\.tv/i, "https://lain.bgm.tv");
}
export async function applyBangumiCandidate(mediaItemId, externalId) {
    const candidate = getDb()
        .prepare("SELECT * FROM metadata_candidates WHERE media_item_id = ? AND provider = 'bangumi' AND external_id = ?")
        .get(mediaItemId, externalId);
    if (!candidate) {
        return refreshBangumiById(mediaItemId, externalId);
    }
    const rawCandidate = JSON.parse(candidate.raw_json || "{}");
    const raw = await fetchBangumiSubjectDetail(externalId) || rawCandidate;
    const [persons, characters, relations] = await Promise.all([
        fetchBangumiSubjectPersons(externalId),
        fetchBangumiSubjectCharacters(externalId),
        fetchBangumiSubjectRelations(externalId)
    ]);
    const rating = raw.rating;
    let coverPath = null;
    if (candidate.cover_url) {
        try {
            coverPath = await cacheCover(candidate.cover_url, `bangumi-${candidate.external_id}`);
        }
        catch (error) {
            log("warning", "scraper", `封面缓存失败：${candidate.title}`, error instanceof Error ? error.message : String(error), mediaItemId);
        }
    }
    getDb()
        .prepare(`
      UPDATE media_items SET
        title = ?, original_title = ?, summary = ?, cover_path = COALESCE(?, cover_path),
        media_type = 'anime', year = ?, air_date = ?, rating = ?, rank = ?,
        metadata_json = ?, tags_json = ?, staff_json = ?, characters_json = ?, relations_json = ?,
        provider = 'bangumi', external_id = ?, updated_at = ?
      WHERE id = ?
    `)
        .run(String(raw.name_cn || candidate.title), String(raw.name || candidate.original_title || ""), preferChineseSummary(String(raw.summary || "")), coverPath, candidate.year ?? null, String(raw.date || ""), rating?.score ?? candidate.score ?? null, rating?.rank ?? null, JSON.stringify(raw), JSON.stringify(extractTags(raw)), JSON.stringify(persons), JSON.stringify(characters), JSON.stringify(relations), candidate.external_id, now(), mediaItemId);
    log("info", "scraper", `已应用 Bangumi 条目：${candidate.title}`, undefined, mediaItemId);
    return getMediaItem(mediaItemId);
}
export async function refreshBangumiById(mediaItemId, externalId) {
    const item = getMediaItem(mediaItemId);
    const subjectId = String(externalId || item?.external_id || "").trim();
    if (!item || !subjectId)
        throw new Error("Bangumi ID not found");
    const raw = await fetchBangumiSubjectDetail(subjectId);
    if (!raw)
        throw new Error(`Bangumi detail not found: ${subjectId}`);
    const images = raw.images;
    const rating = raw.rating;
    const coverUrl = normalizeImageUrl(images?.large || images?.common || images?.medium || images?.grid || null);
    const [persons, characters, relations] = await Promise.all([
        fetchBangumiSubjectPersons(subjectId),
        fetchBangumiSubjectCharacters(subjectId),
        fetchBangumiSubjectRelations(subjectId)
    ]);
    let coverPath = null;
    if (coverUrl) {
        try {
            coverPath = await cacheCover(coverUrl, `bangumi-${subjectId}`);
        }
        catch (error) {
            log("warning", "scraper", `封面缓存失败：${String(raw.name_cn || raw.name || subjectId)}`, error instanceof Error ? error.message : String(error), mediaItemId);
        }
    }
    getDb()
        .prepare(`
      UPDATE media_items SET
        title = ?, original_title = ?, summary = ?, cover_path = COALESCE(?, cover_path),
        media_type = 'anime', year = ?, air_date = ?, rating = ?, rank = ?,
        metadata_json = ?, tags_json = ?, staff_json = ?, characters_json = ?, relations_json = ?,
        provider = 'bangumi', external_id = ?, updated_at = ?
      WHERE id = ?
    `)
        .run(String(raw.name_cn || raw.name || item.clean_name), String(raw.name || ""), preferChineseSummary(String(raw.summary || "")), coverPath, String(raw.date || "").slice(0, 4) ? Number(String(raw.date || "").slice(0, 4)) : null, String(raw.date || ""), rating?.score ?? null, rating?.rank ?? null, JSON.stringify(raw), JSON.stringify(extractTags(raw)), JSON.stringify(persons), JSON.stringify(characters), JSON.stringify(relations), subjectId, now(), mediaItemId);
    log("info", "scraper", `按 Bangumi ID 刷新条目：${String(raw.name_cn || raw.name || subjectId)} (${subjectId})`, undefined, mediaItemId);
    return getMediaItem(mediaItemId);
}
export async function getBangumiSubjectDetail(subjectId) {
    const id = String(subjectId || "").trim();
    if (!id)
        return null;
    const [raw, persons, characters, relations] = await Promise.all([
        fetchBangumiSubjectDetail(id),
        fetchBangumiSubjectPersons(id),
        fetchBangumiSubjectCharacters(id),
        fetchBangumiSubjectRelations(id)
    ]);
    if (!raw)
        return null;
    const images = raw.images;
    const rating = raw.rating;
    const date = String(raw.date || raw.air_date || "");
    return {
        external_id: id,
        title: String(raw.name_cn || raw.name || ""),
        original_title: String(raw.name || "") || null,
        summary: preferChineseSummary(String(raw.summary || "")),
        cover_url: normalizeImageUrl(images?.large || images?.common || images?.medium || images?.grid || null),
        year: date ? Number(date.slice(0, 4)) || null : null,
        air_date: date || null,
        rating: rating || null,
        tags: extractTags(raw),
        infobox: Array.isArray(raw.infobox)
            ? raw.infobox
                .map((row) => ({ key: String(row.key || ""), value: formatInfoboxValue(row.value) }))
                .filter((row) => row.key)
            : [],
        persons,
        characters,
        relations,
        raw_json: JSON.stringify(raw)
    };
}
async function fetchBangumiSubjectPersons(subjectId) {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}/persons`, {
        headers: { "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)" }
    });
    if (!response.ok) {
        log("warning", "scraper", `Bangumi 制作人员获取失败：${subjectId}`, `${response.status} ${await response.text()}`);
        return [];
    }
    return await response.json();
}
async function fetchBangumiSubjectCharacters(subjectId) {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}/characters`, {
        headers: { "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)" }
    });
    if (!response.ok) {
        log("warning", "scraper", `Bangumi 角色获取失败：${subjectId}`, `${response.status} ${await response.text()}`);
        return [];
    }
    return await response.json();
}
async function fetchBangumiSubjectRelations(subjectId) {
    const response = await fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}/subjects`, {
        headers: { "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)" }
    });
    if (!response.ok) {
        log("warning", "scraper", `Bangumi 关联条目获取失败：${subjectId}`, `${response.status} ${await response.text()}`);
        return [];
    }
    return await response.json();
}
export async function getBangumiPersonDetail(personId) {
    const id = String(personId).trim();
    if (!id)
        return null;
    const response = await fetch(`https://api.bgm.tv/v0/persons/${encodeURIComponent(id)}`, {
        headers: { "User-Agent": "local-anime-library/0.1.0 (https://github.com/local)" }
    });
    if (!response.ok) {
        log("warning", "scraper", `Bangumi 人物详情获取失败：${id}`, `${response.status} ${await response.text()}`);
        return null;
    }
    return await response.json();
}
function preferChineseSummary(summary) {
    const marker = summary.match(/[\[【]\s*(?:中文|简体中文|简介|中文简介)\s*[\]】]/);
    if (marker?.index !== undefined) {
        return summary.slice(marker.index + marker[0].length).trim();
    }
    const paragraphs = summary.split(/\n{2,}|\r?\n/).map((part) => part.trim()).filter(Boolean);
    const chinese = paragraphs.filter((part) => /[\u4e00-\u9fff]/.test(part));
    return (chinese.length ? chinese.join("\n") : summary).trim();
}
function extractTags(subject) {
    const tags = Array.isArray(subject.tags) ? subject.tags : [];
    const metaTags = Array.isArray(subject.meta_tags) ? subject.meta_tags : [];
    return [
        ...metaTags.map((name) => ({ name: String(name), count: null })),
        ...tags.map((tag) => {
            const item = tag;
            return { name: String(item.name || ""), count: typeof item.count === "number" ? item.count : null };
        })
    ].filter((tag) => tag.name);
}
function formatInfoboxValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => formatInfoboxValue(entry)).filter(Boolean).join(" / ");
    }
    if (typeof value === "object" && value !== null) {
        if ("v" in value)
            return String(value.v || "");
        if ("value" in value)
            return String(value.value || "");
    }
    return String(value || "");
}
export async function repairCoverCache() {
    const missing = repairMissingCovers();
    const update = getDb().prepare("UPDATE media_items SET cover_path = ?, updated_at = ? WHERE id = ?");
    let repaired = 0;
    let failed = 0;
    for (const row of missing) {
        if (!row.cover_url) {
            failed += 1;
            continue;
        }
        try {
            const coverPath = await cacheCover(row.cover_url, `bangumi-${row.external_id}`);
            if (coverPath) {
                update.run(coverPath, now(), row.id);
                repaired += 1;
            }
            else {
                failed += 1;
            }
        }
        catch (error) {
            failed += 1;
            log("warning", "scraper", `封面缓存修复失败：${row.external_id}`, error instanceof Error ? error.message : String(error), row.id);
        }
        await delay(200);
    }
    log("info", "scraper", `封面缓存修复完成：成功 ${repaired}，失败 ${failed}`);
    return { total: missing.length, repaired, failed };
}
export function clearCoverCache() {
    const posterDir = path.join(getUserDataPath(), "cache", "posters");
    let deleted = 0;
    if (fs.existsSync(posterDir)) {
        for (const entry of fs.readdirSync(posterDir, { withFileTypes: true })) {
            if (!entry.isFile())
                continue;
            fs.unlinkSync(path.join(posterDir, entry.name));
            deleted += 1;
        }
    }
    const cleared = clearCoverPaths();
    log("info", "scraper", `封面缓存已清空：删除 ${deleted} 个文件，清理 ${cleared} 个数据库路径`);
    return { deleted, cleared };
}
export async function resolveMediaCover(mediaItemId) {
    const record = getCoverRecord(mediaItemId);
    if (!record)
        return null;
    if (record.cover_path && fs.existsSync(record.cover_path))
        return record.cover_path;
    if (!record.cover_url || !record.external_id)
        return null;
    try {
        const coverPath = await cacheCover(record.cover_url, `bangumi-${record.external_id}`);
        if (coverPath) {
            updateCoverPath(mediaItemId, coverPath);
            return coverPath;
        }
    }
    catch (error) {
        log("warning", "scraper", `封面自动修复失败：${record.external_id}`, error instanceof Error ? error.message : String(error), mediaItemId);
    }
    return null;
}
let coverDownloadQueue = Promise.resolve();
const MAX_CONCURRENT_COVERS = 3;
let activeCoverDownloads = 0;
async function cacheCover(url, fileBase) {
    // Wait for queue slot if too many active downloads
    while (activeCoverDownloads >= MAX_CONCURRENT_COVERS) {
        await delay(100);
    }
    activeCoverDownloads++;
    try {
        const response = await fetch(url);
        if (!response.ok)
            return null;
        const contentType = response.headers.get("content-type") || "";
        const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
        const posterPath = path.join(getUserDataPath(), "cache", "posters", `${fileBase}${ext}`);
        fs.writeFileSync(posterPath, Buffer.from(await response.arrayBuffer()));
        return posterPath;
    }
    finally {
        activeCoverDownloads--;
    }
}
export async function getBangumiCalendar() {
    const win = await createOffscreenWindow();
    try {
        await win.loadURL("https://api.bgm.tv/calendar");
        const jsonText = await win.webContents.executeJavaScript(`document.body.textContent`);
        return JSON.parse(jsonText);
    }
    finally {
        if (!win.isDestroyed())
            win.destroy();
    }
}
async function createOffscreenWindow() {
    const { BrowserWindow } = await import("electron");
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true,
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    return win;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function getAnimeByTag(tagName, offset = 0, limit = 50, options) {
    const type = options?.type || 2;
    const sort = options?.sort || "rank";
    const airDate = options?.airDate || [];
    const response = await fetch(`https://api.bgm.tv/v0/search/subjects?limit=${limit}&offset=${offset}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({
            keyword: "",
            sort: sort,
            filter: {
                type: [type],
                tag: [tagName],
                ...(airDate.length > 0 ? { air_date: airDate } : {})
            }
        })
    });
    if (!response.ok) {
        throw new Error(`Bangumi tag search failed: ${response.status}`);
    }
    const json = await response.json();
    const rawData = json.data || [];
    const items = rawData.map(normalizeBangumiSubject);
    return {
        tag: tagName,
        total: json.total || items.length,
        data: items
    };
}
export async function getPopularTags() {
    const FALLBACK_TAGS = [
        { name: 'TV', count: 1342041 }, { name: '漫画改', count: 815691 }, { name: '剧场版', count: 700683 },
        { name: '搞笑', count: 609786 }, { name: '原创', count: 594953 }, { name: '恋爱', count: 576402 },
        { name: '轻小说改', count: 521034 }, { name: '战斗', count: 489321 }, { name: '奇幻', count: 476543 },
        { name: '校园', count: 454321 }, { name: '百合', count: 432109 }, { name: '日常', count: 410987 },
        { name: 'OVA', count: 398765 }, { name: '漫改', count: 376543 }, { name: '里番', count: 354321 },
        { name: '治愈', count: 332109 }, { name: '后宫', count: 310987 }, { name: '日本', count: 298765 },
        { name: '异世界', count: 276543 }, { name: '科幻', count: 254321 }, { name: '京阿尼', count: 232109 },
        { name: '热血', count: 210987 }, { name: '游戏改', count: 198765 }, { name: '国产', count: 176543 },
        { name: '泡面番', count: 154321 }, { name: '轻改', count: 132109 }, { name: '小说改', count: 110987 }
    ];
    try {
        const response = await fetch("https://bgm.tv/anime/tag", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        if (!response.ok) {
            log("error", "scraper", `Failed to fetch Bangumi tags: ${response.status}`);
            return FALLBACK_TAGS;
        }
        const html = await response.text();
        const tagMap = new Map();
        const regex = /<a href="\/anime\/tag\/[^"]+"[^>]*>([^<]+)<\/a>\s*<small[^>]*>\(([^)]+)\)<\/small>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const name = match[1].trim();
            const count = parseInt(match[2].replace(/,/g, ""), 10);
            if (name && !isNaN(count)) {
                tagMap.set(name, { name, count });
            }
        }
        const tags = Array.from(tagMap.values());
        if (tags.length === 0) {
            log("warning", "scraper", "Bangumi tag scraper found 0 tags, using fallback.");
            return FALLBACK_TAGS;
        }
        return tags.sort((a, b) => b.count - a.count).slice(0, 60);
    }
    catch (err) {
        log("error", "scraper", `getPopularTags error: ${err}`);
        return FALLBACK_TAGS;
    }
}
