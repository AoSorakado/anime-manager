import { log } from "./db.js";
import { getSeasonCache, setSeasonCache, isCacheExpired } from "./seasonCache.js";
import type { AnimeSeason, NormalizedAnimeItem, SeasonAnimeResponse } from "../shared/types.js";

const USER_AGENT = "local-anime-library/0.1.0 (https://github.com/user/local-anime-library)";
const API_BASE = "https://api.bgm.tv/v0";
const PAGE_LIMIT = 50;
const REQUEST_DELAY = 300; // ms between API calls to respect rate limits

// ──── Season month mapping ────

const SEASON_MONTHS: Record<AnimeSeason, number[]> = {
  winter: [1, 2, 3],
  spring: [4, 5, 6],
  summer: [7, 8, 9],
  autumn: [10, 11, 12],
};

const SEASON_LABELS: Record<AnimeSeason, string> = {
  winter: "冬",
  spring: "春",
  summer: "夏",
  autumn: "秋",
};

// ──── Public API ────

export async function getSeasonAnime(
  year: number,
  season: AnimeSeason,
  options?: { refresh?: boolean }
): Promise<SeasonAnimeResponse> {
  const refresh = options?.refresh ?? false;

  // 1. Check cache (unless forcing refresh)
  if (!refresh) {
    const cached = getSeasonCache(year, season);
    if (cached && !isCacheExpired(cached.updated_at, year, season)) {
      log("info", "scraper", `季度数据命中缓存: ${year} ${SEASON_LABELS[season]} (${cached.updated_at})`);
      return {
        source: "cache",
        stale: false,
        updatedAt: cached.updated_at,
        year,
        season,
        data: JSON.parse(cached.data_json),
      };
    }
  }

  // 2. Fetch from Bangumi API
  try {
    const items = await fetchSeasonFromBangumi(year, season);
    const dataJson = JSON.stringify(items);
    setSeasonCache(year, season, dataJson);
    log("info", "scraper", `Bangumi API 拉取成功: ${year} ${SEASON_LABELS[season]}, ${items.length} 条`);
    return {
      source: "bangumi",
      stale: false,
      updatedAt: new Date().toISOString(),
      year,
      season,
      data: items,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log("error", "scraper", `Bangumi API 请求失败: ${year} ${SEASON_LABELS[season]}`, errMsg);

    // 3. Fallback to stale cache
    const staleCache = getSeasonCache(year, season);
    if (staleCache) {
      log("info", "scraper", `使用过期缓存: ${year} ${SEASON_LABELS[season]}`);
      return {
        source: "cache",
        stale: true,
        updatedAt: staleCache.updated_at,
        year,
        season,
        data: JSON.parse(staleCache.data_json),
      };
    }

    // 4. No cache at all → throw
    throw new Error(`无法获取 ${year} ${SEASON_LABELS[season]}季番组: ${errMsg}`);
  }
}

// ──── Fetch from Bangumi ────

export async function fetchSeasonFromBangumi(year: number, season: AnimeSeason): Promise<NormalizedAnimeItem[]> {
  const months = SEASON_MONTHS[season];
  const allItems: NormalizedAnimeItem[] = [];
  const seenIds = new Set<number>();

  for (const month of months) {
    const monthItems = await fetchMonthFromBangumi(year, month);
    for (const item of monthItems) {
      if (!seenIds.has(item.bangumiId)) {
        seenIds.add(item.bangumiId);
        allItems.push(item);
      }
    }
  }

  // Sort by airDate ascending
  allItems.sort((a, b) => {
    if (!a.airDate && !b.airDate) return 0;
    if (!a.airDate) return 1;
    if (!b.airDate) return -1;
    return a.airDate.localeCompare(b.airDate);
  });

  return allItems;
}

async function fetchMonthFromBangumi(year: number, month: number): Promise<NormalizedAnimeItem[]> {
  const items: NormalizedAnimeItem[] = [];
  let offset = 0;

  while (true) {
    const url = `${API_BASE}/subjects?type=2&sort=date&year=${year}&month=${month}&limit=${PAGE_LIMIT}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) break; // No data for this month
      throw new Error(`Bangumi API ${response.status}: ${await response.text().catch(() => "")}`);
    }

    const json = (await response.json()) as {
      data?: Array<Record<string, any>>;
      total?: number;
      limit?: number;
      offset?: number;
    };

    const pageData = json.data || [];
    if (pageData.length === 0) break;

    for (const raw of pageData) {
      items.push(normalizeBangumiSubject(raw));
    }

    const total = json.total ?? 0;
    offset += PAGE_LIMIT;
    if (offset >= total) break;

    // Rate limit delay
    await delay(REQUEST_DELAY);
  }

  return items;
}

// ──── Normalize raw Bangumi subject ────

export function normalizeBangumiSubject(raw: Record<string, any>): NormalizedAnimeItem {
  const images = raw.images || {};
  const rating = raw.rating || {};
  const airDate: string | null = raw.date || null;

  // Calculate weekday from air date
  let weekday = 0;
  if (airDate) {
    const match = airDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      const day = d.getDay(); // 0=Sun
      weekday = day === 0 ? 7 : day; // Convert to 1=Mon..7=Sun
    }
  }

  return {
    bangumiId: raw.id,
    name: raw.name || "",
    nameCn: raw.name_cn || raw.name || "",
    summary: raw.summary || "",
    airDate,
    eps: raw.eps ?? raw.total_episodes ?? null,
    score: rating.score ?? null,
    rank: rating.rank ?? null,
    ratingTotal: rating.total ?? null,
    weekday,
    images: {
      small: images.small || null,
      grid: images.grid || null,
      large: images.large || null,
      common: images.common || null,
    },
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => ({ name: t.name || "", count: t.count || 0 })) : [],
    raw,
  };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
