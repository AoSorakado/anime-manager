import { flushSync } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Download, Heart, RefreshCw, Search, Star, X } from "lucide-react";
import type { AnimeSeason, BangumiSubjectDetail, NormalizedAnimeItem, OnlineEpisode, OnlineSearchResult, RssItem, SeasonAnimeResponse } from "../../electron/shared/types";
import { extractDominantColor } from "../LiquidGlassRuntime";
import CharacterModal from "../components/CharacterModal";
import GlassSelect from "../components/GlassSelect";
import PersonModal from "../components/PersonModal";
import Poster from "../components/Poster";
import { ratingConsensus, ratingDeviation, trimNumber } from "../utils";

export function SubscriptionsPage({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const currentSeason = useMemo(() => {
    const m = new Date().getMonth() + 1;
    if (m <= 3) return "winter" as AnimeSeason;
    if (m <= 6) return "spring" as AnimeSeason;
    if (m <= 9) return "summer" as AnimeSeason;
    return "autumn" as AnimeSeason;
  }, []);

  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [seasonKey, setSeasonKey] = useState<AnimeSeason>(currentSeason);
  const [seasonData, setSeasonData] = useState<SeasonAnimeResponse | null>(null);
  const [selectedWeekdayIndex, setSelectedWeekdayIndex] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
  const [selectedAnime, setSelectedAnime] = useState<NormalizedAnimeItem | null>(null);
  const [selectedWeeklyDetail, setSelectedWeeklyDetail] = useState<BangumiSubjectDetail | null>(null);
  const [seasonSort, setSeasonSort] = useState<"default" | "rating" | "rank" | "members">("default");
  const [detailTab, setDetailTab] = useState("概览");

  const [searchQuery, setSearchQuery] = useState("");
  const [globalSearchResult, setGlobalSearchResult] = useState<{ mikan: RssItem[], online: OnlineSearchResult[] } | null>(null);
  const [tintColor, setTintColor] = useState("180, 180, 180");
  const lastScrollY = useRef(0);

  // 1. 滚动管理：进入详情重置到顶，退出恢复位置
  useEffect(() => {
    const main = document.querySelector(".main");
    if (selectedAnime) {
      if (main && lastScrollY.current === 0) {
        lastScrollY.current = main.scrollTop;
      }
      main?.scrollTo({ top: 0, behavior: "instant" });
    } else {
      if (lastScrollY.current > 0) {
        const target = lastScrollY.current;
        lastScrollY.current = 0;
        requestAnimationFrame(() => {
          document.querySelector(".main")?.scrollTo({ top: target, behavior: "instant" });
        });
      }
    }
  }, [selectedAnime]);

  // 2. 取色管理
  useEffect(() => {
    if (selectedAnime) {
      const showCover = selectedAnime.images.large || selectedAnime.images.common || "";
      if (showCover) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const color = extractDominantColor(img);
          if (color) setTintColor(color);
        };
        img.src = showCover;
        // 瞬间取色：如果图片已在缓存中
        if (img.complete) {
          const color = extractDominantColor(img);
          if (color) setTintColor(color);
        }
      }
    } else {
      setTintColor("180, 180, 180");
    }
  }, [selectedAnime]);

  const [mikanAirDetails, setMikanAirDetails] = useState<{ summary: string; details: any } | null>(null);

  const [weeklySearchResults, setWeeklySearchResults] = useState<OnlineSearchResult[]>([]);
  const [weeklyEpisodes, setWeeklyEpisodes] = useState<OnlineEpisode[]>([]);
  const [selectedWeeklyResult, setSelectedWeeklyResult] = useState<OnlineSearchResult | null>(null);
  const [mikanDownloadResults, setMikanDownloadResults] = useState<RssItem[]>([]);
  const [selectedSubtitleGroup, setSelectedSubtitleGroup] = useState<string>("全部");
  const [selectedSearchSubtitleGroup, setSelectedSearchSubtitleGroup] = useState<string>("全部");

  const [activeCharacter, setActiveCharacter] = useState<Record<string, unknown> | null>(null);
  const [activePerson, setActivePerson] = useState<Record<string, unknown> | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function loadSeason(year: number, season: AnimeSeason, refresh = false) {
    setBusy("weekly-load");
    setError("");
    try {
      const result = await window.libraryApi.season.getAnime(year, season, { refresh });
      setSeasonData(result);
      if (result.stale) {
        setError("Bangumi 请求失败，正在显示本地旧缓存");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const changeSeason = (year: number, season: AnimeSeason) => {
    setSeasonYear(year);
    setSeasonKey(season);
    setSelectedAnime(null);
    setGlobalSearchResult(null);
    loadSeason(year, season);
  };

  const performGlobalSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setBusy("searching");
    try {
      const [mikan, online] = await Promise.all([
        window.libraryApi.subscriptions.searchMikan(q),
        window.libraryApi.online.search({ keyword: q })
      ]);
      setGlobalSearchResult({ mikan, online });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  };

  async function openAnimeDetail(anime: NormalizedAnimeItem, element?: HTMLElement) {
    const update = () => {
      setSelectedAnime(anime);
      setDetailTab("概览");
      setBusy("weekly-details");
      setSelectedWeeklyDetail(null);
      setSelectedSubtitleGroup("全部");

      setWeeklyEpisodes([]);
      setMikanDownloadResults([]);
      setMikanAirDetails(null);

      try {
        const keyword = anime.nameCn || anime.name;

        // 1. Fetch Bangumi detail
        if (anime.bangumiId) {
          window.libraryApi.season.getDetail(anime.bangumiId).then(detail => {
            setSelectedWeeklyDetail(detail);
          });
        }

        // 2. Fetch Mikan resources (by title search)
        window.libraryApi.season.getMikanResources(keyword).then(results => {
          setMikanDownloadResults(results);
        });

        // 3. Fetch Online Search
        window.libraryApi.online.search({ keyword }).then(async (searchResults) => {
          setWeeklySearchResults(searchResults);
          if (searchResults.length > 0) {
            const first = searchResults[0];
            setSelectedWeeklyResult(first);
            const eps = await window.libraryApi.online.episodes({ ruleUrl: first.rule_url || undefined, url: first.url });
            setWeeklyEpisodes(eps);
          }
        });

      } catch (err) {
        console.error(err);
      } finally {
        setBusy("");
      }
    };

    document.documentElement.classList.add("view-transitioning");
    const transitionApi = (document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }).startViewTransition;
    if (!transitionApi || !element) {
      document.documentElement.classList.remove("view-transitioning");
      update();
      return;
    }

    element.style.setProperty("view-transition-name", "shared-poster");
    const transition = transitionApi.call(document, () => {
      flushSync(update);
    });

    void transition.finished.finally(() => {
      document.documentElement.classList.remove("view-transitioning");
      element.style.removeProperty("view-transition-name");
    });
  }

  async function openCharacterModal(character: Record<string, unknown>) {
    const charId = String(character.id || "").trim();
    if (!charId) {
      setActiveCharacter(character);
      return;
    }
    setLoadingId(charId);
    try {
      let detail = null;
      const scraper = (window.libraryApi as any)?.scraper;
      if (scraper && typeof scraper.getCharacter === "function") {
        detail = await scraper.getCharacter(charId).catch(() => null);
      }
      if (!detail || !detail.infobox) {
        const resp = await fetch(`https://api.bgm.tv/v0/characters/${charId}`).catch(() => null);
        if (resp?.ok) detail = await resp.json();
      }
      setActiveCharacter({ ...character, ...(detail || {}) });
    } finally {
      setLoadingId(null);
    }
  }

  async function openPersonModal(personId: string | number) {
    setLoadingId(String(personId));
    try {
      let detail = null;
      const scraper = (window.libraryApi as any)?.scraper;
      if (scraper && typeof scraper.getPerson === "function") {
        detail = await scraper.getPerson(personId).catch(() => null);
      }
      if (!detail || !detail.infobox) {
        const resp = await fetch(`https://api.bgm.tv/v0/persons/${personId}`).catch(() => null);
        if (resp?.ok) detail = await resp.json();
      }
      setActivePerson(detail || { id: personId, name: String(personId) });
    } finally {
      setLoadingId(null);
    }
  }

  // Auto-load current season on mount
  useEffect(() => {
    loadSeason(seasonYear, seasonKey);
  }, []);

  // Group anime by weekday for display
  const displayGroup = useMemo((): { items: NormalizedAnimeItem[] } | null => {
    if (globalSearchResult) return null;
    if (!seasonData) return null;

    const targetDay = [1, 2, 3, 4, 5, 6, 7][selectedWeekdayIndex]; // 1=Mon..7=Sun
    if (!targetDay) return null;

    const filtered = seasonData.data.filter(item => item.weekday === targetDay);

    // 应用排序
    const sorted = [...filtered].sort((a, b) => {
      if (seasonSort === "rating") {
        return (b.score || 0) - (a.score || 0);
      } else if (seasonSort === "rank") {
        return (a.rank || 99999) - (b.rank || 99999);
      } else if (seasonSort === "members") {
        return (b.ratingTotal || 0) - (a.ratingTotal || 0);
      }
      return 0; // default
    });

    return { items: sorted };
  }, [seasonData, selectedWeekdayIndex, globalSearchResult, seasonSort]);

  if (selectedAnime) {
    const showTitle = selectedAnime.nameCn || selectedAnime.name;
    const showCover = selectedAnime.images.large || selectedAnime.images.common || "";
    return (
      <div className="detail cover-tinted greenTheme" style={{ "--cover-rgb": tintColor } as any}>
        <button className="backButtonGlass" onClick={() => setSelectedAnime(null)} style={{ position: 'sticky', top: '0', zIndex: 24, marginBottom: '14px' }}>
          <ArrowLeft size={16} />
          <span>返回媒体库</span>
        </button>

        <section className="detailHeroSection">
          <div className="detailHeroBg">
            <img src={selectedWeeklyDetail?.cover_url || showCover || undefined} alt="" />
          </div>
          <div className="detailHeroContent">
            <Poster src={selectedWeeklyDetail?.cover_url || showCover || undefined} title={showTitle} large />
            <div className="detailMainInfo">
              <h1>{selectedWeeklyDetail?.title || showTitle}</h1>
              <div className="detailMetaRow">
                <div className="detailMetaItem">
                  <label>放送开始</label>
                  <span>{selectedWeeklyDetail?.air_date || selectedAnime.airDate || "未知"}</span>
                </div>
                <div className="detailMetaItem">
                  <label>评分透视</label>
                  <div className="ratingScoreLine">
                    <span style={{ fontSize: "24px", color: "#2d5a27" }}>{selectedWeeklyDetail?.rating?.score?.toFixed(1) || selectedAnime.score?.toFixed(1) || "--"}</span>
                    <div className="ratingStars">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={14} fill={s <= Math.round((selectedWeeklyDetail?.rating?.score || selectedAnime.score || 0) / 2) ? "#f1c40f" : "none"} stroke="#f1c40f" />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="detailMetaItem">
                  <label>Bangumi Ranked</label>
                  <span className="ratingRank">#{selectedWeeklyDetail?.rating?.rank || selectedAnime.rank || "--"}</span>
                </div>
              </div>
              <button className="detailSubscribeBtn">
                <Heart size={18} />
                <span>未追</span>
              </button>
            </div>

            {selectedWeeklyDetail?.rating?.count && (() => {
              const counts = selectedWeeklyDetail.rating.count;
              const values = Object.values(counts);
              const total = values.reduce((a, b) => a + b, 0);
              const max = Math.max(...values);
              const buckets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => ({
                score: s,
                count: counts[String(s)] || 0
              }));
              return (
                <div className="ratingDistribution">
                  <div className="chartHeader" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '11px', fontWeight: 700, opacity: 0.6 }}>
                    <span>评分分布</span>
                    <span>{total} 投票</span>
                  </div>
                  <div className="chartContainer">
                    {buckets.map(({ score, count }) => {
                      const height = (count / max) * 100;
                      const percent = total ? (count / total) * 100 : 0;
                      return (
                        <div
                          key={score}
                          className={`chartBar ${Number(score) === Math.round(selectedWeeklyDetail.rating!.score!) ? "highlight" : ""}`}
                          style={{ height: `${height}%` }}
                          data-tip={`${trimNumber(percent, 2)}% (${count}人)`}
                        ></div>
                      );
                    })}
                  </div>
                  <div className="chartLabels">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => <span key={s}>{s}</span>)}
                  </div>
                  <div className="chartFoot" style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '11px', opacity: 0.7 }}>
                    <span>标准差：{ratingDeviation(buckets, total, selectedWeeklyDetail.rating!.score || 0)}</span>
                    <span>争议度：<b>{ratingConsensus(buckets, total)}</b></span>
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        <nav className="detailTabs">
          {["概览", "角色", "制作人员", "播放资源"].map(tab => (
            <button key={tab} className={`detailTab ${detailTab === tab ? "active" : ""}`} onClick={() => setDetailTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        <div className="detailBody">
          {detailTab === "概览" && (
            <>
              <section className="detailSection">
                <h2>简介</h2>
                <p className="detailSynopsis">{mikanAirDetails?.summary || selectedWeeklyDetail?.summary || "暂无简介"}</p>
              </section>

              <section className="detailSection">
                <h2>标签</h2>
                <div className="detailTags">
                  {selectedWeeklyDetail?.tags.map(tag => (
                    <div key={tag.name} className="detailTag">
                      {tag.name} <span>{tag.count}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {detailTab === "角色" && (
            <section className="detailSection">
              <h2>角色介绍</h2>
              <div className="characterGrid">
                {selectedWeeklyDetail?.characters.slice(0, 32).map((char: any) => (
                  <div className="characterItem" key={char.id} onClick={() => {
                    void openCharacterModal(char);
                  }}>
                    <img src={char.images?.grid} alt="" />
                    <div className="charInfo">
                      <div className="charName">{loadingId === String(char.id) ? "加载中..." : (char.name_cn || char.name)}</div>
                      <div className="charRelation">{char.relation}</div>
                      <div className="charActor" onClick={(e) => {
                        e.stopPropagation();
                        if (char.actors?.[0]?.id) openPersonModal(char.actors[0].id);
                      }}>{char.actors?.[0]?.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {detailTab === "制作人员" && (
            <section className="detailSection">
              <h2>制作人员</h2>
              <div className="staffGrid">
                {selectedWeeklyDetail?.persons.slice(0, 32).map((person: any, index: number) => (
                  <div className="staffItem" key={index} onClick={() => openPersonModal(person.id)}>
                    <img className="staffAvatar" src={person.images?.grid} alt="" />
                    <div className="staffInfo">
                      <div className="staffRelation">{String(person.relation || "制作")}</div>
                      <div className="staffName">{loadingId === String(person.id) ? "加载中..." : String(person.name_cn || person.name || "")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {detailTab === "播放资源" && (
            <div className="resourceContainer" style={{ marginTop: '24px' }}>
              <section className="resourceSubSection">
                <div className="resourceHeading">
                  <h3>在线播放 (Kazumi Rules)</h3>
                  <select
                    value={selectedWeeklyResult?.url || ""}
                    onChange={async (e) => {
                      const found = weeklySearchResults.find(r => r.url === e.target.value);
                      if (found) {
                        setSelectedWeeklyResult(found);
                        const eps = await window.libraryApi.online.episodes({ ruleUrl: found.rule_url || undefined, url: found.url });
                        setWeeklyEpisodes(eps);
                      }
                    }}
                  >
                    {weeklySearchResults.map(res => <option key={res.url} value={res.url}>{res.rule_name || "未知源"}</option>)}
                  </select>
                </div>
                <div className="onlineEpisodeGrid">
                  {weeklyEpisodes.map((ep, idx) => (
                    <button key={idx} className="onlineEpBtn" onClick={async () => {
                      await window.libraryApi.online.playUrl(ep.url, ep.title, ep.referer, { ruleUrl: ep.rule_url || undefined }, (selectedWeeklyDetail as any)?.external_id || (selectedWeeklyDetail as any)?.id);
                      await onRefresh();
                    }}>
                      <div className="epNum">{ep.title.match(/\d+/)?.[0] ? `第 ${ep.title.match(/\d+/)?.[0]} 集` : ep.title}</div>
                      <div className="epLabel">在线播放</div>
                    </button>
                  ))}
                  {weeklyEpisodes.length === 0 && <div className="emptyState">未找到可用分集资源</div>}
                </div>
              </section>

              <section className="resourceSubSection">
                <div className="resourceHeading">
                  <h3>离线下载 (Mikan RSS)</h3>
                </div>
                <div className="mikanDownloadLayout">
                  <aside className="mikanGroupSidebar">
                    <h4>相关字幕组</h4>
                    <button
                      className={`mikanGroupBtn ${selectedSubtitleGroup === "全部" ? "active" : ""}`}
                      onClick={() => setSelectedSubtitleGroup("全部")}
                    >全部</button>
                    {Array.from(new Set(mikanDownloadResults.map(i => i.subtitle_group || "未知")))
                      .filter(g => g !== "未知")
                      .sort()
                      .map(group => (
                        <button
                          key={group}
                          className={`mikanGroupBtn ${selectedSubtitleGroup === group ? "active" : ""}`}
                          onClick={() => setSelectedSubtitleGroup(group)}
                        >{group}</button>
                      ))
                    }
                  </aside>
                  <main className="mikanResourceMain">
                    <div className="torrentTable">
                      <div className="torrentTableHeader">
                        <div className="colTitle">番组名</div>
                        <div className="colSize">大小</div>
                        <div className="colDate">更新时间</div>
                        <div className="colActions">下载</div>
                      </div>
                      {mikanDownloadResults
                        .filter(item => {
                          const groups = Array.from(new Set(mikanDownloadResults.map(i => i.subtitle_group || "未知")));
                          const currentFilter = groups.includes(selectedSubtitleGroup) ? selectedSubtitleGroup : "全部";
                          return currentFilter === "全部" || item.subtitle_group === currentFilter;
                        })
                        .map((item, idx) => (
                          <div key={idx} className="torrentRow">
                            <div className="colTitle" title={item.title}>
                              <span className="groupBadge">[{item.subtitle_group || "未知"}]</span>
                              {item.title.replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "")}
                            </div>
                            <div className="colSize">{item.size_text || "--"}</div>
                            <div className="colDate">{item.pub_date ? new Date(item.pub_date).toLocaleDateString() : "--"}</div>
                            <div className="colActions">
                              <button title="qBittorrent" onClick={() => window.libraryApi.subscriptions.sendUrl(item.link || "", undefined, item.title, showTitle)}><Download size={14} /></button>
                              <button title="123盘" onClick={() => window.libraryApi.cloudOffline.submit123({ url: item.link || "", title: `${showTitle} - ${item.title}` })}>123</button>
                              <button title="Pikpak" onClick={() => window.libraryApi.cloudOffline.submitPikpak({ url: item.link || "", title: `${showTitle} - ${item.title}` })}>Pik</button>
                            </div>
                          </div>
                        ))}
                      {mikanDownloadResults.length === 0 && <div className="emptyState">未找到种子资源</div>}
                    </div>
                  </main>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* 角色 & 人物详情弹窗 — 复用本地库相同组件 */}
        {activeCharacter && <CharacterModal character={activeCharacter} isLoading={!!loadingId} onClose={() => setActiveCharacter(null)} />}
        {activePerson && <PersonModal person={activePerson} isLoading={!!loadingId} onClose={() => setActivePerson(null)} />}
      </div>
    );
  }

  if (globalSearchResult) {
    return (
      <div className="subscriptionsSearchPage">
        <header className="searchHeader">
          <button className="iconButton" onClick={() => setGlobalSearchResult(null)}><ArrowLeft size={20} /></button>
          <h1>搜索结果: {searchQuery}</h1>
        </header>

        <div className="mikanDownloadLayout">
          <aside className="mikanGroupSidebar">
            <h4>过滤字幕组</h4>
            <button
              className={`mikanGroupBtn ${selectedSearchSubtitleGroup === "全部" ? "active" : ""}`}
              onClick={() => setSelectedSearchSubtitleGroup("全部")}
            >全部</button>
            {Array.from(new Set(globalSearchResult.mikan.map(i => i.subtitle_group || "未知")))
              .filter(g => g !== "未知")
              .sort()
              .map(group => (
                <button
                  key={group}
                  className={`mikanGroupBtn ${selectedSearchSubtitleGroup === group ? "active" : ""}`}
                  onClick={() => setSelectedSearchSubtitleGroup(group)}
                >{group}</button>
              ))
            }
          </aside>

          <main className="mikanResourceMain">
            <section className="resourceSubSection">
              <div className="resourceHeading">
                <h3>在线播放资源</h3>
                <span className="countBadge">找到 {globalSearchResult.online.length} 个结果</span>
              </div>
              <div className="onlineSearchGrid">
                {globalSearchResult.online.map((item, idx) => (
                  <div key={idx} className="onlineSearchCard" onClick={async (e) => {
                    const posterEl = e.currentTarget.querySelector(".poster") as HTMLElement;
                    await openAnimeDetail({
                      id: item.bangumi_id ?? 0,
                      name: item.title,
                      name_cn: item.title,
                      images: { large: item.cover || "", common: item.cover || "", grid: item.cover || "", medium: item.cover || "", small: item.cover || "" },
                      tags: [],
                      summary: "",
                      score: 0,
                      rank: 0,
                      air_date: "",
                      weekday: 0,
                      rating_total: 0,
                      bangumi_id: item.bangumi_id ?? 0,
                      external_id: item.bangumi_id ?? 0
                    } as any, posterEl);
                  }}>
                    <div className="onlineSearchCoverWrapper">
                      <Poster src={item.cover || ""} title={item.title} />
                    </div>
                    <div className="onlineSearchInfo">
                      <h3>{item.title.replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "")}</h3>
                      <p>{item.rule_name || "未知源"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="resourceSubSection" style={{ marginTop: "32px" }}>
              <div className="resourceHeading">
                <h3>BT/RSS 资源 (蜜柑)</h3>
                <span className="countBadge">找到 {globalSearchResult.mikan.length} 个纪录</span>
              </div>
              <div className="torrentTable">
                <div className="torrentTableHeader">
                  <div className="colTitle">标题</div>
                  <div className="colSize">大小</div>
                  <div className="colDate">发布日期</div>
                  <div className="colActions">操作</div>
                </div>
                {globalSearchResult.mikan
                  .filter(item => {
                    return selectedSearchSubtitleGroup === "全部" || item.subtitle_group === selectedSearchSubtitleGroup;
                  })
                  .map((item, idx) => (
                    <div key={idx} className="torrentRow">
                      <div className="colTitle" title={item.title}>
                        <span className="groupBadge">[{item.subtitle_group || "未知"}]</span>
                        {item.title.replace(/\[\s*复制磁链\s*\]|\(\s*复制磁链\s*\)|【\s*复制磁链\s*】|复制磁链/gi, "")}
                      </div>
                      <div className="colSize">{item.size_text || "--"}</div>
                      <div className="colDate">{item.pub_date ? new Date(item.pub_date).toLocaleDateString() : "--"}</div>
                      <div className="colActions">
                        <button title="qBittorrent" onClick={() => window.libraryApi.subscriptions.sendUrl(item.link || "", undefined, item.title, searchQuery)}><Download size={14} /></button>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="mikanHubPage greenTheme">
      <header className="scheduleHeader">
        <div className="headerTop">
          <div className="headerLeft">
            <button className="sourceBtn refreshBtn" onClick={() => loadSeason(seasonYear, seasonKey, true)}>
              <RefreshCw size={14} className={busy === "weekly-load" ? "animate-spin" : ""} />
            </button>
            <div className="historyControls">
              <GlassSelect
                value={String(seasonYear)}
                onChange={(value) => changeSeason(parseInt(value), seasonKey)}
                options={Array.from({ length: new Date().getFullYear() - 2011 }, (_, i) => {
                  const y = new Date().getFullYear() + 1 - i;
                  return { value: String(y), label: `${y}年` };
                })}
              />
              <GlassSelect
                value={seasonKey}
                onChange={(value) => changeSeason(seasonYear, value as AnimeSeason)}
                options={[
                  { value: "winter", label: "冬季 (1月)" },
                  { value: "spring", label: "春季 (4月)" },
                  { value: "summer", label: "夏季 (7月)" },
                  { value: "autumn", label: "秋季 (10月)" }
                ]}
              />
              <GlassSelect
                value={seasonSort}
                onChange={(value) => setSeasonSort(value as any)}
                options={[
                  { value: "default", label: "默认" },
                  { value: "rating", label: "评分" },
                  { value: "rank", label: "排名" },
                  { value: "members", label: "热度" }
                ]}
              />
            </div>
          </div>

          <div className="headerRight">
            <div className="globalSearchBox">
              <Search size={14} className="searchIcon" />
              <input
                type="text"
                placeholder="快速搜索番剧/资源..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && performGlobalSearch()}
              />
              {searchQuery && (
                <button className="clearSearch" onClick={() => { setSearchQuery(""); setGlobalSearchResult(null); }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="headerBottom">
          {!globalSearchResult && (
            <div className="headerInfo">
              <h1>
                {seasonYear}年 {({ winter: "冬", spring: "春", summer: "夏", autumn: "秋" } as Record<string, string>)[seasonKey]}季番组
              </h1>
              <div className="headerStats">
                {seasonData?.stale && <span className="staleLabel">(旧缓存)</span>}
                {seasonData && <span className="countLabel">{seasonData.data.length} 部</span>}
              </div>
            </div>
          )}

          <div className="scheduleTabs">
            {["一", "二", "三", "四", "五", "六", "日"].map((day, i) => (
              <button
                key={day}
                className={`scheduleTab ${selectedWeekdayIndex === i ? "active" : ""}`}
                onClick={() => {
                  setSelectedWeekdayIndex(i);
                  setGlobalSearchResult(null);
                }}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div style={{ margin: "12px 24px", padding: "12px", background: "rgba(255,0,0,0.1)", color: "#c0392b", borderRadius: "8px", fontSize: "14px" }}>
          数据加载失败: {error}
        </div>
      )}

      {!globalSearchResult && (
        <div className="scheduleGrid">
          {(displayGroup?.items || []).map((show: NormalizedAnimeItem) => {
            const title = show.nameCn || show.name;
            const cover = show.images.large || show.images.common || show.images.grid || "";
            const meta = show.airDate ? `放送 · ${show.airDate}` : "日期未知";

            return (
              <button key={show.bangumiId} className="scheduleCard" onClick={(e) => openAnimeDetail(show, e.currentTarget.querySelector(".poster") as HTMLElement)}>
                <div className="scheduleCardCoverWrapper">
                  <Poster src={cover} title={title} />
                </div>
                <div className="scheduleCardContent">
                  <h3>{title}</h3>
                  <p className="scheduleCardMeta">{meta}</p>
                  <div className="scheduleCardStats">
                    {show.score && <span className="rating"><Star size={14} fill="currentColor" /> {show.score.toFixed(1)}</span>}
                    {show.rank && <span><Activity size={14} /> #{show.rank}</span>}
                    {show.ratingTotal && <span><Heart size={14} /> {show.ratingTotal}</span>}
                    {!show.score && <span className="rating"><Star size={14} fill="currentColor" /> --</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {(!displayGroup || displayGroup.items.length === 0) && (
            <div className="emptyState">
              {busy === "weekly-load" ? (
                <>
                  <RefreshCw size={34} className="animate-spin" />
                  <div>正在从 Bangumi 加载 {seasonYear}年{({ winter: "冬", spring: "春", summer: "夏", autumn: "秋" } as Record<string, string>)[seasonKey]}季数据...</div>
                </>
              ) : (
                <>
                  <Activity size={34} />
                  <div>该星期没有番组或数据尚未加载</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
