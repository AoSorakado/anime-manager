import { getDb, log } from "./db.js";
const now = () => new Date().toISOString();
export function getSeasonCache(year, season) {
    return getDb()
        .prepare("SELECT * FROM bangumi_season_cache WHERE year = ? AND season = ?")
        .get(year, season);
}
export function setSeasonCache(year, season, dataJson) {
    getDb()
        .prepare(`
      INSERT INTO bangumi_season_cache (year, season, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(year, season) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `)
        .run(year, season, dataJson, now());
    log("info", "scraper", `季度缓存已更新: ${year} ${season}`);
}
export function clearSeasonCache(year, season) {
    if (year && season) {
        const result = getDb()
            .prepare("DELETE FROM bangumi_season_cache WHERE year = ? AND season = ?")
            .run(year, season);
        return result.changes;
    }
    if (year) {
        const result = getDb()
            .prepare("DELETE FROM bangumi_season_cache WHERE year = ?")
            .run(year);
        return result.changes;
    }
    const result = getDb().prepare("DELETE FROM bangumi_season_cache").run();
    return result.changes;
}
// ──── Cache expiry logic ────
const HOUR = 3600_000;
const DAY = 86400_000;
export function getCurrentAnimeSeason() {
    const d = new Date();
    const month = d.getMonth() + 1; // 1-12
    const year = d.getFullYear();
    if (month <= 3)
        return { year, season: "winter" };
    if (month <= 6)
        return { year, season: "spring" };
    if (month <= 9)
        return { year, season: "summer" };
    return { year, season: "autumn" };
}
export function isFutureSeason(year, season) {
    const current = getCurrentAnimeSeason();
    const seasonOrder = { winter: 0, spring: 1, summer: 2, autumn: 3 };
    const targetValue = year * 10 + seasonOrder[season];
    const currentValue = current.year * 10 + seasonOrder[current.season];
    return targetValue > currentValue;
}
export function isCacheExpired(updatedAt, year, season) {
    const age = Date.now() - new Date(updatedAt).getTime();
    const current = getCurrentAnimeSeason();
    if (year === current.year && season === current.season) {
        return age > 6 * HOUR; // 当前季度: 6小时
    }
    if (isFutureSeason(year, season)) {
        return age > 1 * HOUR; // 未来季度: 1小时
    }
    return age > 7 * DAY; // 历史季度: 7天
}
