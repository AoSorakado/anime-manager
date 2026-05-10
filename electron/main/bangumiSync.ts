import { getSettings, listMediaItems, log } from "./db.js";
import type { BangumiCollectionEntry, BangumiStatusComponent, BangumiStatusIncident, BangumiStatusReport, WatchStatus } from "../shared/types.js";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface BangumiSyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
}

export async function testBangumiToken(token?: string) {
  const accessToken = (token || getSettings().bangumiToken || "").trim();
  if (!accessToken) throw new Error("Bangumi Access Token 为空");

  // 1. 验证 Token 有效性并获取基本信息 (bgm.tv)
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

  const statusData = JSON.parse(text) as { user_id: number };

  // 2. 获取详细信息以提取 username 字符串 (api.bgm.tv)
  // v0 API 的 /{username}/collections 路径必须使用 username 字符串，UID 会导致 404
  try {
    const userResp = await fetch("https://api.bgm.tv/v0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      }
    });
    if (userResp.ok) {
      const userData = await userResp.json() as { id: number; username: string; nickname: string };
      log("info", "database", "Bangumi 用户信息获取成功", JSON.stringify({ id: userData.id, username: userData.username }));
      return {
        user_id: userData.id,
        username: userData.username,
        nickname: userData.nickname
      };
    }
  } catch (err) {
    log("warning", "scraper", "无法通过 v0/me 获取用户名，将回退到 UID", err instanceof Error ? err.message : String(err));
  }

  return { user_id: statusData.user_id, username: String(statusData.user_id) };
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
    throw new Error("请先在设置中配置 Bangumi Access Token");
  }

  // 从 /v0/me 获取真实用户名；Bangumi v0 API 的 /users/{username}/collections 要求 username 字符串，不支持 UID
  let username: string;
  try {
    const userInfo = await testBangumiToken(accessToken);
    username = userInfo.username;
  } catch (err) {
    log("warning", "scraper", "Bangumi Token 验证失败", err);
    throw new Error("Bangumi Token 验证失败，请重新登录");
  }

  const allEntries: BangumiCollectionEntry[] = [];
  const limit = 30;

  // 每种收藏类型独立分页拉取
  // Bangumi API 返回结构：{ data: [{ subject_id, subject_type, rate, type, private, comment, ep_status, vol_status, updated_at, subject: { id, name, name_cn, images, eps } }], total, limit, offset }
  for (const type of [1, 2, 3, 4, 5]) {
    let offset = 0;
    while (true) {
      const params = new URLSearchParams({
        type: String(type),
        subject_type: "2", // 只获取动画
        limit: String(limit),
        offset: String(offset),
      });
      const url = `https://api.bgm.tv/v0/users/${username}/collections?${params.toString()}`;
      log("info", "scraper", `正在请求 Bangumi 收藏: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": USER_AGENT,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        log("error", "scraper", `获取 Bangumi 收藏失败 (HTTP ${response.status}, type=${type}, offset=${offset})`, text);
        throw new Error(`获取 Bangumi 收藏失败：HTTP ${response.status}`);
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
        allEntries.push({
          subject_id: raw.subject_id,
          subject_name: subj?.name || "",
          subject_name_cn: subj?.name_cn || "",
          subject_images: subj?.images,
          subject_type: raw.subject_type,
          subject_eps: subj?.eps != null ? subj.eps : (raw as any).subject?.eps_total,
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

  log("info", "scraper", `获取 Bangumi 收藏完成：共 ${allEntries.length} 条`);
  return allEntries;
}

/** 获取 Bangumi 服务状态
 *  优先从 bgm-status.ry.mk Atom feed 获取详细事件；
 *  若该站点不可达（如国内网络限制），回退到多端点连通性探测 */
export async function fetchBangumiServiceStatus(): Promise<BangumiStatusReport> {
  // 主路径：第三方状态页（有详细事件信息）
  try {
    const url = `https://bgm-status.ry.mk/api/feed.atom?t=${Date.now()}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": USER_AGENT }
    });
    if (response.ok) {
      const xml = await response.text();
      return { ...parseStatusFeed(xml), source: "feed" as const };
    }
    log("warning", "scraper", `bgm-status.ry.mk 返回 HTTP ${response.status}，切换到连通性探测`);
  } catch (err) {
    log("warning", "scraper", `bgm-status.ry.mk 不可达（${err instanceof Error ? err.message : String(err)}），切换到连通性探测`);
  }

  // Fallback：多端点连通性探测
  return await probeBangumiEndpoints();
}

/** 多端点连通性探测：模拟状态页监控规则，检测 Bangumi 各核心服务的实际可用性 */
async function probeBangumiEndpoints(): Promise<BangumiStatusReport> {
  // 每个端点指定探测方式：GET 页面 / POST 搜索 API
  const probes: Array<{
    name: string;
    url: string;
    method: "GET" | "POST";
    body?: string;
    /** 除了看 HTTP 状态码，额外判断响应体是否有效 */
    validate?: (resp: Response, text: string) => boolean;
  }> = [
    {
      name: "主站页面",
      url: "https://bgm.tv/",
      method: "GET",
      validate: (_, text) => text.includes("bangumi") || text.length > 800,
    },
    {
      name: "搜索服务",
      url: "https://api.bgm.tv/v0/search/subjects",
      method: "POST",
      body: JSON.stringify({ keyword: "test", filter: { type: [2] } }),
      validate: (resp, text) => resp.ok && (() => { try { const j = JSON.parse(text); return j && typeof j === "object"; } catch { return false; } })(),
    },
    {
      name: "日历服务",
      url: "https://api.bgm.tv/v0/calendar",
      method: "GET",
      validate: (resp, text) => resp.ok && (() => { try { const j = JSON.parse(text); return Array.isArray(j); } catch { return false; } })(),
    },
    {
      name: "镜像站点",
      url: "https://bangumi.tv/",
      method: "GET",
      validate: (_, text) => text.includes("bangumi") || text.length > 800,
    },
  ];

  const components: BangumiStatusReport["components"] = [];
  const results = await Promise.allSettled(
    probes.map(async (ep) => {
      const start = Date.now();
      const init: RequestInit = {
        method: ep.method,
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/json",
          ...(ep.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        redirect: "follow",
      };
      if (ep.body) init.body = ep.body;
      const resp = await fetch(ep.url, init);
      const text = await resp.text().catch(() => "");
      const latencyMs = Date.now() - start;
      const valid = ep.validate ? ep.validate(resp, text) : resp.ok;
      return { ...ep, statusCode: resp.status, latencyMs, valid };
    })
  );

  let degradedCount = 0;
  let outageCount = 0;

  for (let i = 0; i < probes.length; i++) {
    const ep = probes[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      const { statusCode, latencyMs, valid } = result.value;
      const status: BangumiStatusComponent["status"] = valid
        ? "operational"
        : statusCode >= 500
        ? "outage"
        : "degraded";
      if (status === "degraded") degradedCount++;
      if (status === "outage") outageCount++;
      components.push({ name: ep.name, url: ep.url, status, statusCode, latencyMs });
    } else {
      outageCount++;
      components.push({ name: ep.name, url: ep.url, status: "outage" });
    }
  }

  const overall: BangumiStatusReport["overall"] =
    outageCount > 0 ? "outage" : degradedCount > 0 ? "degraded" : "operational";

  log("info", "scraper", `Bangumi 连通性探测完成：${overall}（${components.map((c) => `${c.name}=${c.status}${c.latencyMs != null ? `/${c.latencyMs}ms` : ""}`).join(", ")}）`);

  return {
    overall,
    updated: new Date().toISOString(),
    source: "probe",
    incidents: [],
    components,
  };
}

/** 从已获取的 Atom feed XML 解析状态报告 */
function parseStatusFeed(xml: string): BangumiStatusReport {
  const entries = parseAtomEntries(xml);
  const incidents: BangumiStatusIncident[] = [];

  for (const entry of entries) {
    const title = extractTag(entry, "title");
    const summary = extractTag(entry, "summary") || extractTag(entry, "content");
    const linkEl = /<link[^>]*href="([^"]*)"[^>]*\/?>/.exec(entry) || /<link[^>]*href='([^']*)'[^>]*\/?>/.exec(entry);
    const rawLink = linkEl?.[1] || "";
    const published = extractTag(entry, "published") || extractTag(entry, "updated") || "";
    const updated = extractTag(entry, "updated") || published;
    const id = extractTag(entry, "id") || rawLink;

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

  let overall: BangumiStatusReport["overall"] = "operational";
  const now = Date.now();
  const recentThreshold = 48 * 60 * 60 * 1000;

  const activeIncidents = incidents.filter((inc) => {
    const time = new Date(inc.published || inc.updated).getTime();
    const isRecent = now - time < recentThreshold;
    const isUnresolved = inc.severity !== "resolved";
    return isRecent && isUnresolved;
  });

  if (activeIncidents.some((inc) => inc.severity === "major")) {
    overall = "outage";
  } else if (activeIncidents.some((inc) => inc.severity === "minor")) {
    overall = "degraded";
  }

  log("info", "scraper", `Bangumi 服务状态查询完成：${overall}，事件 ${incidents.length} 条`);

  return {
    overall,
    updated: incidents[0]?.updated || new Date().toISOString(),
    source: "feed" as const,
    incidents: incidents.slice(0, 30),
  };
}

/** 从 Atom XML 中提取所有 <entry>...</entry> 块 */
function parseAtomEntries(xml: string): string[] {
  const result: string[] = [];
  const re = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
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
