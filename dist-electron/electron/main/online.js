import { BrowserWindow } from "electron";
import { getSettings, log } from "./db.js";
const KAZUMI_RULES_INDEX = "https://raw.githubusercontent.com/Predidit/KazumiRules/main/index.json";
const KAZUMI_RULES_BASE = "https://raw.githubusercontent.com/Predidit/KazumiRules/main/";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RENDER_SETTLE_DELAY_MS = 900;
const MIKAN_DEFAULT_BASE = "https://mikanani.me";
const STABLE_RULE_NAMES = ["AGE", "7sefun", "aafun"];
const ruleCache = new Map();
/**
 * Enhanced XPath Parser using a hidden BrowserWindow.
 */
class XPathParser {
    static instance;
    window = null;
    static getInstance() {
        if (!XPathParser.instance)
            XPathParser.instance = new XPathParser();
        return XPathParser.instance;
    }
    async ensureWindow() {
        if (this.window && !this.window.isDestroyed())
            return;
        this.window = new BrowserWindow({
            show: false,
            webPreferences: {
                offscreen: true,
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        await this.window.loadURL("about:blank");
    }
    async parse(html, rules) {
        await this.ensureWindow();
        if (!this.window)
            throw new Error("无法初始化解析引擎");
        await this.window.webContents.executeJavaScript(`
      document.documentElement.innerHTML = ${JSON.stringify(html)};
    `);
        const results = await this.window.webContents.executeJavaScript(`
      (function() {
        function getByXPath(root, xpath, attr = 'text') {
          if (!xpath) return null;
          try {
            const result = document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const node = result.singleNodeValue;
            if (!node) return null;
            if (attr === 'text') return node.textContent?.trim() || "";
            if (attr === 'href') return (node.getAttribute('href') || node.getAttribute('data-href') || "").trim();
            if (attr === 'src') return (node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-original') || "").trim();
            return (node.getAttribute(attr) || "").trim();
          } catch (e) {
            return null;
          }
        }

        const listNodes = document.evaluate(${JSON.stringify(rules.list)}, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const data = [];
        for (let i = 0; i < listNodes.snapshotLength; i++) {
          const node = listNodes.snapshotItem(i);
          data.push({
            name: getByXPath(node, ${JSON.stringify(rules.name || "./text()")}, 'text') || node.textContent?.trim(),
            result: getByXPath(node, ${JSON.stringify(rules.result || ".//a")}, 'href'),
            cover: getByXPath(node, ${JSON.stringify(rules.cover || ".//img")}, 'src')
          });
        }
        return data;
      })()
    `);
        return results;
    }
    async parseEpisodes(html, rule) {
        await this.ensureWindow();
        if (!this.window)
            throw new Error("无法初始化解析引擎");
        await this.window.webContents.executeJavaScript(`
      document.documentElement.innerHTML = ${JSON.stringify(html)};
    `);
        const results = await this.window.webContents.executeJavaScript(`
      (function() {
        function getByXPath(root, xpath, attr = 'text') {
          if (!xpath) return null;
          try {
            const result = document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const node = result.singleNodeValue;
            if (!node) return null;
            if (attr === 'text') return node.textContent?.trim() || "";
            if (attr === 'href') return (node.getAttribute('href') || node.getAttribute('data-href') || "").trim();
            return (node.getAttribute(attr) || "").trim();
          } catch (e) {
            return null;
          }
        }

        const roadXpath = ${JSON.stringify(rule.chapterRoads || "//body")};
        const itemXpath = ${JSON.stringify(rule.chapterResult || ".//a")};
        const nameXpath = ${JSON.stringify(rule.chapterName || "./text()")};
        const urlXpath = ${JSON.stringify(rule.chapterUrl || ".//a")};

        const roadNodes = document.evaluate(roadXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const episodes = [];
        const maxRoads = roadNodes.snapshotLength > 1 && roadXpath.includes('playlist') ? 1 : roadNodes.snapshotLength;
        
        for (let i = 0; i < maxRoads; i++) {
          const road = roadNodes.snapshotItem(i);
          const items = document.evaluate(itemXpath, road, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let j = 0; j < items.snapshotLength; j++) {
            const item = items.snapshotItem(j);
            episodes.push({
              title: getByXPath(item, nameXpath, 'text') || item.textContent?.trim(),
              url: getByXPath(item, urlXpath, 'href') || (item.tagName === 'A' ? item.getAttribute('href') : null)
            });
          }
        }
        return episodes;
      })()
    `);
        return results;
    }
}
async function renderPageHtml(url, rule) {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true,
            images: false,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    try {
        const userAgent = rule.userAgent?.trim() || DEFAULT_USER_AGENT;
        win.webContents.setUserAgent(userAgent);
        await win.loadURL(url, {
            userAgent,
            httpReferrer: safeOrigin(url),
            extraHeaders: buildExtraHeaders(rule) || undefined
        });
        await win.webContents.executeJavaScript(`new Promise((resolve) => setTimeout(resolve, ${RENDER_SETTLE_DELAY_MS}))`);
        return await win.webContents.executeJavaScript("document.documentElement.outerHTML");
    }
    finally {
        if (!win.isDestroyed())
            win.destroy();
    }
}
export async function listMikanWeeklyShows() {
    return fetchMikanSchedule(mikanWeeklyUrl());
}
export async function listMikanHistory(year, season) {
    const base = (getSettings().mikanBaseUrl || MIKAN_DEFAULT_BASE).trim().replace(/\/+$/, "");
    const url = `${base}/Home/BangumiCoverFlowByDayOfWeek?year=${year}&seasonStr=${encodeURIComponent(season)}`;
    return fetchMikanSchedule(url, `${year} ${season}季`);
}
export async function fetchMikanDetails(mikanId) {
    const base = (getSettings().mikanBaseUrl || MIKAN_DEFAULT_BASE).trim().replace(/\/+$/, "");
    const url = `${base}/Home/Bangumi/${mikanId}`;
    const win = await createMikanWindow();
    try {
        await win.loadURL(url);
        await win.webContents.executeJavaScript(`new Promise(r => setTimeout(r, 800))`);
        const data = await win.webContents.executeJavaScript(`(() => {
      const summaryNode = document.querySelector('.mikan-content .mikan-expand');
      const infoNodes = Array.from(document.querySelectorAll('.bangumi-info p'));
      const details = {};
      infoNodes.forEach(p => {
        const text = p.textContent?.trim() || "";
        if (text.includes('：')) {
          const [k, v] = text.split('：');
          details[k.trim()] = v.trim();
        }
      });
      return {
        summary: summaryNode ? summaryNode.textContent.trim() : "",
        details
      };
    })()`);
        return data;
    }
    finally {
        if (!win.isDestroyed())
            win.destroy();
    }
}
async function fetchMikanSchedule(url, defaultSeasonLabel = "番剧时间表") {
    const win = await createMikanWindow();
    try {
        await win.loadURL(url);
        // Wait for rendering
        await win.webContents.executeJavaScript(`new Promise(r => setTimeout(r, 1000))`);
        const seasonLabel = await win.webContents.executeJavaScript(`(() => {
      const titleNode = document.querySelector('.mikan-title');
      return titleNode ? titleNode.textContent.trim() : "";
    })()`);
        const groups = await win.webContents.executeJavaScript(`(() => {
      const origin = location.origin;
      const headers = Array.from(document.querySelectorAll('div[id^="data-row-"]'));
      
      return headers.map((heading) => {
        const weekdayIndex = parseInt(heading.id.replace('data-row-', ''));
        const weekdayLabel = heading.textContent.trim();
        
        const items = [];
        let next = heading.nextElementSibling;
        while (next && !next.id.startsWith('data-row-')) {
          if (next.classList.contains('an-box')) {
            const lis = Array.from(next.querySelectorAll('li'));
            items.push(...lis.map((li) => {
              const titleNode = li.querySelector('a.an-text');
              const coverNode = li.querySelector('.js-expand_bangumi');
              const dateNode = li.querySelector('.date-text');
              
              const href = titleNode?.getAttribute('href') || '';
              
              let coverUrl = "";
              const style = coverNode?.getAttribute('style') || "";
              const bgMatch = style.match(/url\\(["']?([^"']+)["']?\\)/);
              if (bgMatch) coverUrl = bgMatch[1];
              if (!coverUrl) coverUrl = coverNode?.getAttribute('data-src') || "";

              return {
                bangumi_id: li.getAttribute('data-bangumiid') || "",
                title: titleNode?.getAttribute('title') || titleNode?.textContent?.trim() || "",
                url: href ? new URL(href, origin).toString() : '',
                cover_url: coverUrl ? new URL(coverUrl, origin).toString() : '',
                updated_at: dateNode?.textContent?.trim() || "",
                weekday_index: weekdayIndex,
                weekday_label: weekdayLabel,
                season_label: ${JSON.stringify(String(seasonLabel || defaultSeasonLabel))}
              };
            }));
          }
          next = next.nextElementSibling;
        }

        return { 
          weekday_index: weekdayIndex, 
          weekday_label: weekdayLabel, 
          items: items.filter(item => item.title && item.url) 
        };
      }).filter(Boolean);
    })()`);
        return {
            season_label: String(seasonLabel || defaultSeasonLabel).trim(),
            groups: groups
        };
    }
    finally {
        if (!win.isDestroyed())
            win.destroy();
    }
}
export async function listBangumiAirtime(year) {
    const targetYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const url = `https://bgm.tv/anime/browser/${targetYear}/airtime`;
    const win = await createMikanWindow();
    try {
        await win.loadURL(url);
        await win.webContents.executeJavaScript(`new Promise(r => setTimeout(r, 800))`);
        const items = await win.webContents.executeJavaScript(`(() => {
      const origin = location.origin;
      const seen = new Set();
      // Try multiple selectors for the list
      const listItems = Array.from(document.querySelectorAll('#browserItemList li, ul.browserList li, .item li'));
      if (listItems.length === 0) {
        // Fallback: any li that looks like a subject item
        const allLis = Array.from(document.querySelectorAll('li'));
        return allLis.filter(li => li.querySelector('a[href^="/subject/"]')).map(li => {
          return extractItem(li);
        }).filter(Boolean);
      }

      function extractItem(li) {
        try {
          const anchor = li.querySelector('a.l, a[href^="/subject/"]');
          if (!anchor) return null;
          const href = anchor.getAttribute('href') || '';
          const idMatch = href.match(/\\/subject\\/(\\d+)/);
          const subjectId = idMatch ? idMatch[1] : '';
          const title = anchor.textContent?.trim();
          if (!subjectId || !title || seen.has(subjectId)) return null;
          seen.add(subjectId);
          
          const airTextNode = li.querySelector('.info, .date');
          const airText = airTextNode?.textContent?.trim() || li.textContent?.trim() || "";
          
          const img = li.querySelector('img');
          const cover = img?.getAttribute('src') || img?.getAttribute('data-src') || "";
          
          function getWeekday(text) {
            let match = text.match(/(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
            if (!match) match = text.match(/(\\d{4})年(\\d{1,2})月(\\d{1,2})日/);
            if (match) {
              const dateObj = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
              const day = dateObj.getDay();
              return day === 0 ? 7 : day;
            }
            return 0;
          }

          return {
            bangumi_id: subjectId,
            title,
            url: new URL(href, origin).toString(),
            cover_url: cover ? (cover.startsWith('//') ? 'https:' + cover : new URL(cover, origin).toString()) : '',
            air_text: airText,
            weekday: getWeekday(airText)
          };
        } catch (e) { return null; }
      }

      return listItems.map(extractItem).filter(Boolean);
    })()`);
        const grouped = new Map();
        for (const item of items) {
            const season = inferBangumiSeason(item.air_text || "");
            const bucket = grouped.get(season) || [];
            bucket.push({
                ...item,
                season
            });
            grouped.set(season, bucket);
        }
        return {
            year: targetYear,
            groups: Array.from(grouped.entries()).map(([season, items]) => ({
                season,
                items
            }))
        };
    }
    finally {
        if (!win.isDestroyed())
            win.destroy();
    }
}
/**
 * Advanced Video URL Sniffer.
 * Mimics original Kazumi logic: network interception, header injection, and content-type detection.
 */
export class VideoSniffer {
    static snifferWindow = null;
    static async sniff(pageUrl, rule) {
        return new Promise((resolve, reject) => {
            // Cleanup previous window
            if (this.snifferWindow && !this.snifferWindow.isDestroyed()) {
                this.snifferWindow.destroy();
            }
            const win = new BrowserWindow({
                show: false,
                webPreferences: {
                    offscreen: true,
                    images: false,
                    webSecurity: false
                }
            });
            this.snifferWindow = win;
            const userAgent = rule.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36";
            win.webContents.setUserAgent(userAgent);
            let found = false;
            const timeout = setTimeout(() => {
                if (!found) {
                    if (!win.isDestroyed())
                        win.destroy();
                    reject(new Error("嗅探视频流超时（15秒），请尝试手动刷新或更换播放线路"));
                }
            }, 15000);
            const filter = { urls: ["*://*/*"] };
            // 1. Force Header Injection (Referer/UA) for all sub-requests
            win.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
                details.requestHeaders["User-Agent"] = userAgent;
                details.requestHeaders["Referer"] = pageUrl;
                if (rule.header) {
                    Object.assign(details.requestHeaders, rule.header);
                }
                callback({ requestHeaders: details.requestHeaders });
            });
            // 2. Network Interception (URL and Content-Type)
            win.webContents.session.webRequest.onResponseStarted(filter, (details) => {
                if (found)
                    return;
                const url = details.url;
                const contentType = (details.responseHeaders?.["content-type"] || details.responseHeaders?.["Content-Type"] || [""])[0].toLowerCase();
                const isMediaUrl = /\.(m3u8|mp4|flv|f4v|m4s)(\?|$)/i.test(url);
                const isMediaHeader = contentType.includes("video/") ||
                    contentType.includes("mpegurl") ||
                    contentType.includes("mpeg-url") ||
                    (details.responseHeaders?.["range"] || details.responseHeaders?.["Range"]);
                if ((isMediaUrl || isMediaHeader) && !url.includes("base64") && !url.includes("favicon") && !url.includes(".js") && !url.includes(".css")) {
                    found = true;
                    clearTimeout(timeout);
                    log("info", "online", `[嗅探成功] 发现流：${url}`, { contentType });
                    // Small delay to allow the window to finish some tasks before closing
                    setTimeout(() => { if (!win.isDestroyed())
                        win.destroy(); }, 1000);
                    resolve({ url, referer: pageUrl });
                }
            });
            win.loadURL(pageUrl).catch((err) => {
                if (!found) {
                    clearTimeout(timeout);
                    if (!win.isDestroyed())
                        win.destroy();
                    reject(err);
                }
            });
        });
    }
}
export async function listOnlineRules() {
    const json = await fetchText(KAZUMI_RULES_INDEX);
    const parsed = JSON.parse(json);
    const entries = normalizeRuleIndex(parsed);
    return entries
        .map((entry) => {
        const name = String(entry.name || "").trim();
        if (!name || /hanime|hentai|里番|girlgirllove|lmm|yishijie|xfdm|dm84/i.test(name))
            return null;
        return {
            name,
            url: entry.url?.trim() || new URL(`${encodeURIComponent(name)}.json`, KAZUMI_RULES_BASE).toString(),
            version: entry.version ?? null,
            lastModified: entry.lastModified || entry.last_modified || null
        };
    })
        .filter(Boolean);
}
export async function onlineSearch(input) {
    const keyword = input.keyword.trim();
    if (!keyword)
        return [];
    if (input.ruleUrl || input.ruleJson) {
        const rule = await loadRule(input);
        const ruleUrl = input.ruleUrl?.trim() || null;
        const searchPageUrl = fillSearchUrl(rule.searchURL || rule.searchUrl || "", keyword, rule);
        return searchWithRule(rule, searchPageUrl, keyword, ruleUrl, rule.name || null);
    }
    const rules = await listOnlineRules();
    const preferredRules = pickStableRules(rules);
    const aggregate = [];
    // Parallel search for preferred rules
    const preferredResults = await Promise.allSettled(preferredRules.map((ruleMeta) => searchWithRuleUrl(ruleMeta.url, keyword, ruleMeta.name)));
    for (let i = 0; i < preferredResults.length; i++) {
        const res = preferredResults[i];
        if (res.status === "fulfilled") {
            aggregate.push(...res.value);
        }
        else {
            log("warning", "online", `自动搜索规则失败：${preferredRules[i].name}`, String(res.reason));
        }
    }
    if (aggregate.length === 0) {
        const backupRules = rules.filter((rule) => !preferredRules.some((preferred) => preferred.url === rule.url)).slice(0, 6);
        const backupResults = await Promise.allSettled(backupRules.map((ruleMeta) => searchWithRuleUrl(ruleMeta.url, keyword, ruleMeta.name)));
        for (let i = 0; i < backupResults.length; i++) {
            const res = backupResults[i];
            if (res.status === "fulfilled") {
                aggregate.push(...res.value);
            }
            else {
                log("warning", "online", `备用规则搜索失败：${backupRules[i].name}`, String(res.reason));
            }
        }
    }
    const finalResults = dedupeSearchResults(aggregate, keyword).slice(0, 80);
    log("info", "online", `自动搜索完成：${keyword}`, `${finalResults.length} 条结果`);
    return finalResults;
}
async function searchWithRuleUrl(ruleUrl, keyword, ruleName) {
    const rule = await loadRule({ ruleUrl });
    const searchPageUrl = fillSearchUrl(rule.searchURL || rule.searchUrl || "", keyword, rule);
    return searchWithRule(rule, searchPageUrl, keyword, ruleUrl, ruleName || rule.name || null);
}
async function searchWithRule(rule, searchPageUrl, keyword, ruleUrl, ruleName) {
    const template = rule.searchURL || rule.searchUrl;
    if (!template)
        throw new Error("规则缺少搜索配置");
    const parser = XPathParser.getInstance();
    let rawResults = [];
    let fetchError = null;
    try {
        const html = await fetchText(searchPageUrl, rule);
        rawResults = await parser.parse(html, {
            list: rule.searchList || "//a",
            name: rule.searchName,
            result: rule.searchResult,
            cover: rule.searchCover
        });
    }
    catch (error) {
        fetchError = error instanceof Error ? error : new Error(String(error));
    }
    if (rawResults.length === 0) {
        try {
            const renderedHtml = await renderPageHtml(searchPageUrl, rule);
            const renderedResults = await parser.parse(renderedHtml, {
                list: rule.searchList || "//a",
                name: rule.searchName,
                result: rule.searchResult,
                cover: rule.searchCover
            });
            if (renderedResults.length > 0) {
                rawResults = renderedResults;
                log("info", "online", `WebView 兜底搜索成功：${keyword}`, searchPageUrl);
            }
        }
        catch (error) {
            log("warning", "online", `WebView 兜底搜索失败：${keyword}`, error instanceof Error ? error.message : String(error));
        }
    }
    if (rawResults.length === 0 && fetchError) {
        throw fetchError;
    }
    const results = [];
    const seenUrls = new Set();
    for (const item of rawResults) {
        if (!item.name || !item.result)
            continue;
        const itemUrl = absolutize(item.result, searchPageUrl);
        if (!itemUrl || seenUrls.has(itemUrl))
            continue;
        seenUrls.add(itemUrl);
        results.push({
            title: cleanText(item.name),
            url: itemUrl,
            cover: item.cover ? absolutize(item.cover, searchPageUrl) : null,
            referer: searchPageUrl,
            raw: "",
            rule_url: ruleUrl,
            rule_name: ruleName || rule.name || null
        });
    }
    const filtered = results.filter((item) => isLikelyAnimeSearchResult(item, keyword));
    const finalResults = filtered.length > 0 ? filtered : results;
    if (filtered.length === 0 && results.length > 0) {
        log("warning", "online", `搜索结果全部被过滤，回退到原始结果：${keyword}`, searchPageUrl);
    }
    return finalResults;
}
function dedupeSearchResults(results, keyword) {
    const grouped = new Map();
    for (const item of results) {
        const key = normalizeForMatch(item.title) || item.url;
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, item);
            continue;
        }
        if (scoreSearchResult(item, keyword) > scoreSearchResult(existing, keyword)) {
            grouped.set(key, item);
        }
    }
    return Array.from(grouped.values()).sort((left, right) => scoreSearchResult(right, keyword) - scoreSearchResult(left, keyword));
}
export async function onlineEpisodes(input) {
    const rule = await loadRule(input);
    const parser = XPathParser.getInstance();
    let rawEpisodes = [];
    let fetchError = null;
    try {
        const html = await fetchText(input.url, rule);
        rawEpisodes = await parser.parseEpisodes(html, rule);
    }
    catch (error) {
        fetchError = error instanceof Error ? error : new Error(String(error));
    }
    if (rawEpisodes.length === 0) {
        try {
            const renderedHtml = await renderPageHtml(input.url, rule);
            const renderedEpisodes = await parser.parseEpisodes(renderedHtml, rule);
            if (renderedEpisodes.length > 0) {
                rawEpisodes = renderedEpisodes;
                log("info", "online", `WebView 兜底剧集解析成功：${input.url}`, input.url);
            }
        }
        catch (error) {
            log("warning", "online", `WebView 兜底剧集解析失败：${input.url}`, error instanceof Error ? error.message : String(error));
        }
    }
    if (rawEpisodes.length === 0 && fetchError) {
        throw fetchError;
    }
    const results = [];
    const seenUrls = new Set();
    const seenTitles = new Set();
    for (const item of rawEpisodes) {
        if (!item.title || !item.url)
            continue;
        const title = cleanText(item.title);
        const url = absolutize(item.url, input.url);
        if (!url || seenUrls.has(url))
            continue;
        if (/^\d{4}$/.test(title) && !title.includes("集") && !title.includes("话"))
            continue;
        const normalizedTitle = normalizeForMatch(title);
        if (seenTitles.has(normalizedTitle))
            continue;
        seenUrls.add(url);
        seenTitles.add(normalizedTitle);
        results.push({
            title,
            url,
            referer: input.url,
            raw: "",
            rule_url: input.ruleUrl || null,
            rule_name: rule.name || null
        });
    }
    const filtered = results.filter((episode) => isLikelyEpisodeLink(episode));
    return (filtered.length > 0 ? filtered : results).slice(0, 400);
}
export async function sniffAndPlay(input) {
    const rule = await loadRule(input);
    const pageUrl = input.url;
    log("info", "online", `开始深度嗅探：${input.title || pageUrl}`);
    try {
        const result = await VideoSniffer.sniff(pageUrl, rule);
        const { playUrl } = await import("./player.js");
        playUrl(result.url, input.title, result.referer, input.bangumiId);
    }
    catch (error) {
        log("error", "online", `嗅探失败：${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}
async function loadRule(input) {
    if (input.ruleJson?.trim())
        return JSON.parse(input.ruleJson.trim());
    const ruleUrl = input.ruleUrl?.trim() || "";
    if (!ruleUrl)
        throw new Error("规则缺失");
    const cached = ruleCache.get(ruleUrl);
    if (cached)
        return cached;
    const json = await fetchText(ruleUrl);
    if (!json)
        throw new Error("规则缺失");
    const parsed = JSON.parse(json);
    ruleCache.set(ruleUrl, parsed);
    return parsed;
}
function fillSearchUrl(template, keyword, rule) {
    const encoded = encodeURIComponent(keyword.trim());
    let resolved = template.includes("@keyword")
        ? template.replaceAll("@keyword", encoded)
        : template.includes("{keyword}")
            ? template.replaceAll("{keyword}", encoded)
            : template.includes("%s")
                ? template.replaceAll("%s", encoded)
                : `${template}${template.includes("?") ? "" : "/"}${encoded}`;
    if (!/^https?:\/\//i.test(resolved)) {
        const base = rule?.baseURL?.trim();
        if (base) {
            try {
                resolved = new URL(resolved, base).toString();
            }
            catch {
                // Keep the original value if the rule's base URL is malformed.
            }
        }
    }
    return resolved;
}
async function fetchText(url, rule) {
    const headers = {
        "User-Agent": rule?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        "Referer": new URL(url).origin
    };
    if (rule?.header) {
        Object.assign(headers, rule.header);
    }
    const response = await fetch(url, { headers });
    if (!response.ok)
        throw new Error(`请求网页失败: HTTP ${response.status}`);
    return response.text();
}
function normalizeRuleIndex(parsed) {
    if (Array.isArray(parsed))
        return parsed;
    if (parsed && typeof parsed === "object") {
        const record = parsed;
        const list = record.data || record.rules || record.list || record.items;
        if (Array.isArray(list))
            return list;
        return Object.entries(record).map(([name, value]) => {
            if (value && typeof value === "object")
                return { name, ...value };
            return { name, url: typeof value === "string" ? value : undefined };
        });
    }
    return [];
}
function pickStableRules(rules) {
    const prioritized = STABLE_RULE_NAMES.flatMap((name) => rules.filter((rule) => rule.name === name));
    const seen = new Set();
    const result = [];
    for (const rule of prioritized) {
        if (seen.has(rule.url))
            continue;
        seen.add(rule.url);
        result.push(rule);
    }
    return result;
}
function absolutize(path, base) {
    if (!path)
        return "";
    const trimmed = path.trim();
    if (/^https?:\/\//i.test(trimmed))
        return trimmed;
    try {
        const baseUrl = new URL(base);
        if (trimmed.startsWith("//"))
            return `${baseUrl.protocol}${trimmed}`;
        if (trimmed.startsWith("/"))
            return `${baseUrl.origin}${trimmed}`;
        return new URL(trimmed, base).href;
    }
    catch {
        return trimmed;
    }
}
function cleanText(value) {
    return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
const SEARCH_NAV_WORDS = ["首页", "主页", "番剧", "排行榜", "历史记录", "最近更新", "排行", "热门"];
const EPISODE_NAV_WORDS = [
    "首页",
    "主页",
    "目录",
    "列表",
    "上一页",
    "下一页",
    "上一集",
    "下一集",
    "上一话",
    "下一话",
    "返回",
    "返回首页",
    "排行",
    "排行榜",
    "热门",
    "最新",
    "最近更新",
    "下载",
    "客户端下载",
    "客户端",
    "登录",
    "注册",
    "收藏",
    "评论",
    "留言",
    "分享",
    "公告",
    "专题",
    "播放",
    "简介",
    "搜索"
];
function isLikelyAnimeSearchResult(item, keyword) {
    const title = item.title.trim();
    if (!title || title.length > 90)
        return false;
    if (SEARCH_NAV_WORDS.includes(title))
        return false;
    return !/javascript:|#$/i.test(item.url);
}
function isLikelyEpisodeLink(episode) {
    const title = episode.title.trim();
    if (!title || title.length > 80)
        return false;
    if (/javascript:|#$/i.test(episode.url))
        return false;
    const normalizedTitle = normalizeForMatch(title);
    if (EPISODE_NAV_WORDS.some((word) => normalizeForMatch(word) === normalizedTitle))
        return false;
    if (/^(?:首页|主页|目录|列表|下载|客户端|登录|注册|收藏|评论|留言|分享|公告|专题)$/i.test(title))
        return false;
    if (/^(?:ep|episode|ova|oad|sp|s\d+e\d+)/i.test(normalizedTitle))
        return true;
    if (/第[一二三四五六七八九十0-9]+[话集篇季]?/i.test(title))
        return true;
    if (/\b\d{1,3}\b/.test(title) && /[集话篇季回]/.test(title))
        return true;
    if (/^(?:\d{1,3}|0\d{1,2})$/.test(normalizedTitle))
        return true;
    if (/[集话篇季回正片特别篇番外前篇后篇]/.test(title))
        return true;
    return false;
}
function scoreSearchResult(item, keyword) {
    const title = normalizeForMatch(item.title);
    const query = normalizeForMatch(keyword);
    let score = 0;
    if (title === query)
        score += 1000;
    else if (title.includes(query))
        score += 650;
    else if (query.includes(title))
        score += 420;
    score += Math.max(0, 120 - title.length);
    if (item.cover)
        score += 30;
    if (item.rule_name)
        score += 5;
    return score;
}
async function createMikanWindow() {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true,
            images: true,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    win.webContents.setUserAgent(DEFAULT_USER_AGENT);
    return win;
}
async function createBangumiWindow() {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true,
            images: false,
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    await win.loadURL("about:blank");
    return win;
}
function inferBangumiSeason(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    // Handle YYYY-MM-DD or YYYY-M-D
    const dateMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
        const month = parseInt(dateMatch[2]);
        if (month >= 10)
            return "秋";
        if (month >= 7)
            return "夏";
        if (month >= 4)
            return "春";
        if (month >= 1)
            return "冬";
    }
    if (/\b(1[0-2]|10|11|12)月\b/.test(normalized) || /秋/.test(normalized))
        return "秋";
    if (/\b(7|8|9)月\b/.test(normalized) || /夏/.test(normalized))
        return "夏";
    if (/\b(4|5|6)月\b/.test(normalized) || /春/.test(normalized))
        return "春";
    if (/\b(1|2|3)月\b/.test(normalized) || /冬/.test(normalized))
        return "冬";
    return "未明";
}
function mikanWeeklyUrl() {
    const base = (getSettings().mikanBaseUrl || MIKAN_DEFAULT_BASE).trim().replace(/\/+$/, "");
    return base; // Point to home page instead of /Home/Classic
}
function normalizeForMatch(value) {
    return value.toLowerCase().replace(/[\s《》「」『』【】\[\]（）()'"“”‘’.,，。!！?？:：;；、·・_-]/g, "");
}
function buildExtraHeaders(rule) {
    if (!rule?.header)
        return "";
    return Object.entries(rule.header)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
}
function safeOrigin(url) {
    try {
        return new URL(url).origin;
    }
    catch {
        return undefined;
    }
}
