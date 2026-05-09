import { getSettings, listMediaItems, log } from "./db.js";
import type { BangumiCollectionEntry, BangumiStatusIncident, BangumiStatusReport, MediaItem, WatchStatus } from "../shared/types.js";

const USER_AGENT = "local-anime-library/0.1.0 (private desktop app)";

export interface BangumiSyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
}

export async function testBangumiToken(token?: string) {
  const accessToken = (token || getSettings().bangumiToken || "").trim();
  if (!accessToken) throw new Error("Bangumi Access Token 为空");
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
  return JSON.parse(text) as { user_id: number; expires?: number; client_id?: string };
}

export async function syncLocalWatchStatusToBangumi(): Promise<BangumiSyncResult> {
  const settings = getSettings();
  const token = settings.bangumiToken?.trim();
  if (!token) throw new Error("请先在设置页填写 Bangumi Access Token");

  const privateCollection = settings.bangumiPrivateCollection === "true";
  const syncUnwatched = settings.bangumiSyncUnwatched === "wish";
  const items = listMediaItems("", "created_at", "all").filter((item) => item.provider === "bangumi" && item.external_id);
  const result: BangumiSyncResult = { total: items.length, synced: 0, skipped: 0, failed: 0 };
  log("info", "scraper", `开始同步本地观看状态到 Bangumi：${items.length} 个已匹配条目`);

  for (const item of items) {
    const type = collectionTypeForStatus(item.watch_status, syncUnwatched);
    if (!type) {
      result.skipped += 1;
      continue;
    }
    try {
      await updateBangumiSubjectStatus(token, item.external_id!, type, privateCollection);
      result.synced += 1;
    } catch (error) {
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

function collectionTypeForStatus(status: WatchStatus, syncUnwatched: boolean) {
  if (status === "watched") return 2;
  if (status === "watching") return 3;
  if (status === "on_hold") return 4;
  if (status === "dropped") return 5;
  if (status === "unwatched" && syncUnwatched) return 1;
  return null;
}

export async function updateBangumiSubjectStatus(token: string, subjectId: string | number, status: number, isPrivate = false) {
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

/** 获取用户 Bangumi 全部收藏条目（想看/看过/在看/搁置/抛弃） */
export async function listBangumiCollections(token?: string): Promise<BangumiCollectionEntry[]> {
  const settings = getSettings();
  const accessToken = (token || settings.bangumiToken || "").trim();
  if (!accessToken) {
    log("error", "scraper", "listBangumiCollections: token 为空", JSON.stringify({ hasArg: !!token, dbToken: settings.bangumiToken ? `${settings.bangumiToken.slice(0, 8)}...` : "(empty)" }));
    throw new Error("请先在设置页填写 Bangumi Access Token");
  }

  const entries: BangumiCollectionEntry[] = [];
  const limit = 50;

  // 每种收藏类型独立分页拉取
  // Bangumi API 返回结构：{ data: [{ subject_id, subject_type, rate, type, private, comment, ep_status, vol_status, updated_at, subject: { id, name, name_cn, images, eps } }], total, limit, offset }
  for (const type of [1, 2, 3, 4, 5]) {
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({
        type: String(type),
        limit: String(limit),
        offset: String(offset),
      });
      const url = `https://api.bgm.tv/v0/users/-/collections?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        log("error", "scraper", `获取 Bangumi 收藏失败 (type=${type}, offset=${offset})`, text);
        throw new Error(`获取 Bangumi 收藏失败：${response.status}`);
      }

      const page = await response.json() as {
        data?: Array<{
          subject_id: number;
          subject_type: number;
          rate?: number;
          type: number;
          private?: boolean;
          comment?: string;
          ep_status?: number;
          vol_status?: number;
          updated_at: string;
          subject?: {
            id: number;
            name: string;
            name_cn: string;
            images?: { large?: string; common?: string; medium?: string; small?: string; grid?: string };
            eps?: number;
          };
        }>;
        total: number;
        limit: number;
        offset: number;
      };

      if (!page.data) break;

      for (const raw of page.data) {
        const subj = raw.subject;
        entries.push({
          subject_id: raw.subject_id,
          subject_name: subj?.name || "",
          subject_name_cn: subj?.name_cn || "",
          subject_images: subj?.images,
          subject_type: raw.subject_type,
          subject_eps: subj?.eps != null ? subj.eps : (raw as any).subject?.eps_total, // 有时 eps_total 在 subject 上
          updated_at: raw.updated_at,
          collection_type: raw.type,
          comment: raw.comment,
          rate: raw.rate,
          private: raw.private ?? false,
        });
      }

      if (page.data.length < limit) break;
      offset += limit;
      await delay(300);
    }
  }

  log("info", "scraper", `获取 Bangumi 收藏完成：共 ${entries.length} 条`);
  return entries;
}

/** 解析 bgm-status.ry.mk Atom feed，返回 Bangumi 服务状态 */
export async function fetchBangumiServiceStatus(): Promise<BangumiStatusReport> {
  let response: Response;
  try {
    response = await fetch("https://bgm-status.ry.mk/api/feed.atom", {
      headers: { "User-Agent": "local-anime-library/0.1.0" },
    });
  } catch (err) {
    log("error", "scraper", "fetchBangumiServiceStatus: 网络请求失败", err instanceof Error ? err.message : String(err));
    throw new Error(`无法连接到 Bangumi 状态服务：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "(无法读取响应)");
    log("error", "scraper", `fetchBangumiServiceStatus: HTTP ${response.status}`, text.slice(0, 200));
    throw new Error(`获取 Bangumi 服务状态失败：HTTP ${response.status}`);
  }

  const xml = await response.text();

  // 简易 Atom XML 解析
  const entries = parseAtomEntries(xml);
  const incidents: BangumiStatusIncident[] = [];

  // 解析每个 entry
  for (const entry of entries) {
    const title = extractTag(entry, "title");
    const summary = extractTag(entry, "summary") || extractTag(entry, "content");
    const linkEl = /<link[^>]*href="([^"]*)"[^>]*\/?>/.exec(entry) || /<link[^>]*href='([^']*)'[^>]*\/?>/.exec(entry);
    const rawLink = linkEl?.[1] || "";
    const published = extractTag(entry, "published") || extractTag(entry, "updated") || "";
    const updated = extractTag(entry, "updated") || published;
    const id = extractTag(entry, "id") || rawLink;

    // 从 title/summary 推断 severity
    let severity: BangumiStatusIncident["severity"] = "minor";
    const fullText = `${title || ""} ${summary || ""}`.toLowerCase();
    if (/resolved|已修复|恢复|已解决/i.test(fullText)) {
      severity = "resolved";
    } else if (/outage|故障|down|不可用|宕机|offline|停止服务|崩溃/i.test(fullText)) {
      severity = "major";
    } else if (/degraded|降级|部分|缓慢|延迟|slow|partial|minor|维护|maintenance/i.test(fullText)) {
      severity = "minor";
    }

    incidents.push({
      id: (id || rawLink || title || "").replace(/<[^>]*>/g, "").trim(),
      title: (title || "未知事件").replace(/<[^>]*>/g, "").trim(),
      severity,
      summary: (summary || "").replace(/<[^>]*>/g, "").trim(),
      published,
      updated,
      link: rawLink,
    });
  }

  // 推断整体状态
  let overall: BangumiStatusReport["overall"] = "operational";
  if (incidents.some((inc) => inc.severity === "major")) {
    overall = "outage";
  } else if (incidents.some((inc) => inc.severity === "minor")) {
    overall = "degraded";
  } else if (incidents.length === 1 && incidents[0].severity === "resolved") {
    overall = "operational";
  } else if (incidents.length === 0) {
    overall = "operational";
  }

  log("info", "scraper", `Bangumi 服务状态查询完成：${overall}，事件 ${incidents.length} 条`);

  return {
    overall,
    updated: incidents[0]?.updated || new Date().toISOString(),
    incidents: incidents.slice(0, 30),
  };
}

/** 从 Atom XML 中提取所有 <entry>...</entry> 块 */
function parseAtomEntries(xml: string): string[] {
  const result: string[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    result.push(match[1]);
  }
  return result;
}

/** 从 XML 元素中提取指定标签的文本内容 */
function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(block);
  return match?.[1] || "";
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
