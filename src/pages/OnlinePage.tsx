import { useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, Search } from "lucide-react";
import type { OnlineEpisode, OnlineRuleMeta, OnlineSearchResult } from "../../electron/shared/types";
import { ONLINE_STATE_KEY, OnlinePageState, readJsonState, writeJsonState } from "../utils";
import Poster from "../components/Poster";

export function OnlinePage({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const cachedState = useMemo(() => readJsonState<OnlinePageState>(ONLINE_STATE_KEY, {
    ruleQuery: "",
    keyword: "",
    selectedRuleUrl: ""
  }), []);
  const [rules, setRules] = useState<OnlineRuleMeta[]>([]);
  const [ruleQuery, setRuleQuery] = useState(cachedState.ruleQuery);
  const [keyword, setKeyword] = useState(cachedState.keyword);
  const [selectedRuleUrl, setSelectedRuleUrl] = useState(cachedState.selectedRuleUrl);
  const [searchResults, setSearchResults] = useState<OnlineSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<OnlineSearchResult | null>(null);
  const [episodes, setEpisodes] = useState<OnlineEpisode[]>([]);
  const [busy, setBusy] = useState("");
  const [playingEpisodeUrl, setPlayingEpisodeUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const playEpisode = async (episode: OnlineEpisode, bId?: string | number) => {
    setPlayingEpisodeUrl(episode.url);
    try {
      await window.libraryApi.online.playUrl(episode.url, episode.title, episode.referer, { ruleUrl: selectedRuleUrl || undefined }, bId);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlayingEpisodeUrl("");
    }
  };

  const ruleFilter = ruleQuery.trim().toLowerCase();
  const filteredRules = useMemo(() => {
    if (!ruleFilter) return rules;
    return rules.filter((rule) => [rule.name, rule.url, rule.version, rule.lastModified].filter(Boolean).join(" ").toLowerCase().includes(ruleFilter));
  }, [rules, ruleFilter]);
  const selectedRule = useMemo(() => rules.find((rule) => rule.url === selectedRuleUrl) || rules[0] || null, [rules, selectedRuleUrl]);

  useEffect(() => {
    writeJsonState(ONLINE_STATE_KEY, {
      ruleQuery,
      keyword,
      selectedRuleUrl
    });
  }, [keyword, ruleQuery, selectedRuleUrl]);

  useEffect(() => {
    if (!rules.length) return;
    if (selectedRuleUrl && rules.some((rule) => rule.url === selectedRuleUrl)) return;
    setSelectedRuleUrl(rules[0].url);
  }, [rules, selectedRuleUrl]);

  useEffect(() => {
    void refreshRules();
  }, []);

  async function refreshRules() {
    if (busy === "rules") return;
    setBusy("rules");
    try {
      const nextRules = await window.libraryApi.online.listRules();
      setRules(nextRules);
      if (!selectedRuleUrl && nextRules[0]) {
        setSelectedRuleUrl(nextRules[0].url);
      }
      setMessage(`已加载 ${nextRules.length} 条规则`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function runSearch(targetRuleUrl = selectedRuleUrl, targetKeyword = keyword) {
    const query = targetKeyword.trim();
    if (!query) {
      setError("请输入搜索关键词");
      return;
    }
    const rule = rules.find((item) => item.url === targetRuleUrl) || null;
    if (!rule) {
      setError("请先选择一条规则");
      return;
    }
    setBusy("search");
    try {
      setSelectedRuleUrl(rule.url);
      const results = await window.libraryApi.online.search({ ruleUrl: rule.url, keyword: query });
      setSearchResults(results);
      setSelectedResult(null);
      setEpisodes([]);
      setMessage(`搜索完成：${results.length} 条结果`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function selectRule(ruleUrl: string) {
    setSelectedRuleUrl(ruleUrl);
    const query = keyword.trim();
    if (!query) {
      setSelectedResult(null);
      setEpisodes([]);
      setError("");
      return;
    }
    await runSearch(ruleUrl, query);
  }

  async function openResult(result: OnlineSearchResult) {
    if (!selectedRule) {
      setError("请先选择一条规则");
      return;
    }
    setSelectedResult(result);
    setBusy("episodes");
    try {
      const nextEpisodes = await window.libraryApi.online.episodes({ ruleUrl: selectedRule.url, url: result.url });
      setEpisodes(nextEpisodes);
      setMessage(`剧集解析完成：${nextEpisodes.length} 集`);
      setError("");
    } catch (err) {
      setEpisodes([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }


  return (
    <div className="onlinePage">
      <header className="toolbar onlineToolbar">
        <div className="searchBox">
          <Search size={18} />
          <input value={ruleQuery} onChange={(event) => setRuleQuery(event.target.value)} placeholder="筛选规则名称" />
        </div>
        <button className="iconButton" onClick={() => void refreshRules()} title="刷新规则">
          <RefreshCw size={18} className={busy === "rules" ? "spin" : ""} />
        </button>
        <div className="onlineRuleMeta">
          <strong>{selectedRule?.name || "未选择规则"}</strong>
          <span>{selectedRule ? [selectedRule.version ? `v${selectedRule.version}` : null, selectedRule.lastModified || null].filter(Boolean).join(" · ") || selectedRule.url : "加载规则后选择一条"}</span>
        </div>
      </header>
      {(message || error) && <div className={`notice ${error ? "error" : ""}`}>{error || message}</div>}

      <section className="onlineLayout">
        <aside className="panel onlineRulePanel">
          <div className="panelTitleRow">
            <h2>规则管理</h2>
            <span>{filteredRules.length}/{rules.length}</span>
          </div>
          <div className="onlineRuleList">
            {filteredRules.map((rule) => (
              <button
                key={rule.url}
                className={`onlineRuleItem ${selectedRuleUrl === rule.url ? "active" : ""}`}
                onClick={() => void selectRule(rule.url)}
              >
                <strong>{rule.name}</strong>
                <span>{rule.url.replace(/^https?:\/\/[^/]+/i, "")}</span>
                <small>{[rule.version ? `v${rule.version}` : null, rule.lastModified || null].filter(Boolean).join(" · ") || "Kazumi 规则"}</small>
              </button>
            ))}
            {filteredRules.length === 0 && <p className="emptyHint">没有匹配的规则。</p>}
          </div>
        </aside>

        <section className="onlineMainColumn">
          <div className="panel onlineHeroPanel">
            <h1>在线播放</h1>
            <p>选择一条规则搜索站点，再进入剧集列表播放。播放时会通过隐藏 WebView 嗅探实际媒体地址，然后交给 mpv。</p>
            <div className="onlineHeroStats">
              <div>
                <strong>{rules.length}</strong>
                <span>在线规则</span>
              </div>
              <div>
                <strong>{searchResults.length}</strong>
                <span>搜索结果</span>
              </div>
              <div>
                <strong>{episodes.length}</strong>
                <span>已解析剧集</span>
              </div>
            </div>
          </div>

          <section className="panel onlineSearchPanel">
            <div className="panelTitleRow">
              <h2>搜索站点</h2>
              <span>{selectedRule ? selectedRule.name : "先选择规则"}</span>
            </div>
            <div className="toolbar compact onlineSearchToolbar">
              <div className="searchBox">
                <Search size={18} />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch();
                  }}
                  placeholder="输入番名、剧名或关键词"
                />
              </div>
              <button className="primaryButton" disabled={busy === "search"} onClick={() => void runSearch()}>
                <Search size={18} className={busy === "search" ? "spin" : ""} />
                <span>{busy === "search" ? "搜索中" : "搜索"}</span>
              </button>
            </div>
            <div className="onlineResultGrid">
              {searchResults.map((result) => (
                <button
                  key={result.url}
                  className={`onlineResultCard ${selectedResult?.url === result.url ? "active" : ""}`}
                  onClick={() => void openResult(result)}
                >
                  <Poster src={result.cover || undefined} title={result.title} small />
                  <div className="onlineResultMeta">
                    <strong>{result.title}</strong>
                    <span>{result.url.replace(/^https?:\/\/[^/]+/i, "")}</span>
                    {result.referer ? <small>Referer: {result.referer.replace(/^https?:\/\/[^/]+/i, "")}</small> : null}
                  </div>
                </button>
              ))}
              {searchResults.length === 0 && <p className="emptyHint">搜索结果会显示在这里。</p>}
            </div>
          </section>

          <section className="panel onlineEpisodePanel">
            <div className="panelTitleRow">
              <h2>剧集列表</h2>
              <span>{selectedResult?.title || "点击上方搜索结果后加载"}</span>
            </div>
            {selectedResult ? (
              <div className="onlineEpisodeList">
                {episodes.map((episode) => (
                  <div className="onlineEpisodeItem" key={`${selectedResult?.url || selectedRule?.url || "online"}-${episode.url}-${episode.title}`}>
                    <div>
                      <strong>{episode.title}</strong>
                      <small>{episode.referer ? episode.referer.replace(/^https?:\/\/[^/]+/i, "") : (selectedResult?.url || selectedRule?.url || "").replace(/^https?:\/\/[^/]+/i, "")}</small>
                    </div>
                    <button className="secondaryButton" disabled={playingEpisodeUrl === episode.url} onClick={() => void playEpisode(episode, selectedResult?.bangumi_id ?? undefined)}>
                      <Play size={16} />
                      <span>{playingEpisodeUrl === episode.url ? "播放中" : "播放"}</span>
                    </button>
                  </div>
                ))}
                {episodes.length === 0 && <p className="emptyHint">点击某个搜索结果后会在这里显示剧集。</p>}
              </div>
            ) : (
              <p className="hintText">先选择规则并搜索一个站点，再点开结果加载剧集。</p>
            )}
          </section>
        </section>
      </section>
    </div>
  );
}
