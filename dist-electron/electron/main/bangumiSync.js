import { getSettings, listMediaItems, log } from "./db.js";
const USER_AGENT = "local-anime-library/0.1.0 (private desktop app)";
export async function testBangumiToken(token) {
    const accessToken = (token || getSettings().bangumiToken || "").trim();
    if (!accessToken)
        throw new Error("Bangumi Access Token 为空");
    const response = await fetch("https://bgm.tv/oauth/token_status", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT
        },
        body: new URLSearchParams({ access_token: accessToken })
    });
    const text = await response.text();
    if (!response.ok) {
        log("error", "scraper", "Bangumi Token 验证失败", text);
        throw new Error(`Bangumi Token 验证失败：${response.status}`);
    }
    log("info", "database", "Bangumi Token 验证成功", text);
    return JSON.parse(text);
}
export async function syncLocalWatchStatusToBangumi() {
    const settings = getSettings();
    const token = settings.bangumiToken?.trim();
    if (!token)
        throw new Error("请先在设置页填写 Bangumi Access Token");
    const privateCollection = settings.bangumiPrivateCollection === "true";
    const syncUnwatched = settings.bangumiSyncUnwatched === "wish";
    const items = listMediaItems("", "created_at", "all").filter((item) => item.provider === "bangumi" && item.external_id);
    const result = { total: items.length, synced: 0, skipped: 0, failed: 0 };
    log("info", "scraper", `开始同步本地观看状态到 Bangumi：${items.length} 个已匹配条目`);
    for (const item of items) {
        const type = collectionTypeForStatus(item.watch_status, syncUnwatched);
        if (!type) {
            result.skipped += 1;
            continue;
        }
        try {
            await updateBangumiSubjectStatus(token, item.external_id, type, privateCollection);
            result.synced += 1;
        }
        catch (error) {
            result.failed += 1;
            log("error", "scraper", `同步 Bangumi 失败：${item.title || item.clean_name}`, error instanceof Error ? error.message : String(error), item.id);
        }
        if ((result.synced + result.failed + result.skipped) % 20 === 0) {
            log("info", "scraper", `Bangumi 同步进度：${result.synced + result.failed + result.skipped}/${result.total}，成功 ${result.synced}，跳过 ${result.skipped}，失败 ${result.failed}`);
        }
        await delay(650);
    }
    log("info", "scraper", `Bangumi 同步完成：成功 ${result.synced}，跳过 ${result.skipped}，失败 ${result.failed}`);
    return result;
}
function collectionTypeForStatus(status, syncUnwatched) {
    if (status === "watched")
        return 2;
    if (status === "watching")
        return 3;
    if (status === "on_hold")
        return 4;
    if (status === "dropped")
        return 5;
    if (status === "unwatched" && syncUnwatched)
        return 1;
    return null;
}
export async function updateBangumiSubjectStatus(token, subjectId, status, isPrivate = false) {
    const response = await fetch(`https://api.bgm.tv/v0/users/-/collections/${encodeURIComponent(String(subjectId))}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT
        },
        body: JSON.stringify({
            type: status,
            private: isPrivate
        })
    });
    if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
    }
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
