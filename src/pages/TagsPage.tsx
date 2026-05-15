import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Heart, RefreshCw, Star, Tag } from "lucide-react";
import type { BangumiSubjectDetail, BangumiTag, BangumiTagAnimeResponse, NormalizedAnimeItem, OnlineEpisode, OnlineSearchResult, RssItem } from "../../electron/shared/types";
import { extractDominantColor } from "../LiquidGlassRuntime";
import CharacterModal from "../components/CharacterModal";
import GlassSelect from "../components/GlassSelect";
import PersonModal from "../components/PersonModal";
import Poster from "../components/Poster";
import { ratingConsensus, ratingDeviation, trimNumber } from "../utils";

export function TagsPage() {
  const [popularTags, setPopularTags] = useState<BangumiTag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagData, setTagData] = useState<BangumiTagAnimeResponse | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selectedAnime, setSelectedAnime] = useState<NormalizedAnimeItem | null>(null);
  const [selectedWeeklyDetail, setSelectedWeeklyDetail] = useState<BangumiSubjectDetail | null>(null);
  const [detailTab, setDetailTab] = useState("概览");
  const [weeklySearchResults, setWeeklySearchResults] = useState<OnlineSearchResult[]>([]);
  const [weeklyEpisodes, setWeeklyEpisodes] = useState<OnlineEpisode[]>([]);
  const [selectedWeeklyResult, setSelectedWeeklyResult] = useState<OnlineSearchResult | null>(null);
  const [mikanDownloadResults, setMikanDownloadResults] = useState<RssItem[]>([]);
  const [selectedSubtitleGroup, setSelectedSubtitleGroup] = useState<string>("全部");
  const [activeCharacter, setActiveCharacter] = useState<Record<string, unknown> | null>(null);
  const [activePerson, setActivePerson] = useState<Record<string, unknown> | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [tagType, setTagType] = useState<number>(2);
  const [tagSort, setTagSort] = useState<string>("rank");
  const [tagYear, setTagYear] = useState<string>("全部");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [tintColor, setTintColor] = useState("180, 180, 180");
  const lastScrollY = useRef(0);

  // 1. 滚动与状态持久化：进入详情重置到顶，退出恢复位置；跨页面导航持久化
  const STORAGE_KEY = "localAnime.tagsPageState";

  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.selectedAnime) {
      setSelectedAnime(saved.selectedAnime);
    }
    if (saved.lastScrollY) {
      lastScrollY.current = saved.lastScrollY;
    }
    // 注意：selectedTag 不持久化，因为 TagsPage 主要是列表流
  }, []);

  useEffect(() => {
    const main = document.querySelector(".main");
    
    // 始终同步当前状态到 sessionStorage，确保导航回来时状态正确
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedAnime,
      lastScrollY: lastScrollY.current
    }));

    if (selectedAnime) {
      if (main && lastScrollY.current === 0) {
        lastScrollY.current = main.scrollTop;
      }
      main?.scrollTo({ top: 0, behavior: "instant" });
    } else {
      if (lastScrollY.current > 0) {
        const target = lastScrollY.current;
        lastScrollY.current = 0;
        
        // 增加延时确保列表渲染完成
        const id = setTimeout(() => {
          const mainEl = document.querySelector(".main");
          mainEl?.scrollTo({ top: target, behavior: "instant" });
          requestAnimationFrame(() => mainEl?.scrollTo({ top: target, behavior: "instant" }));
        }, 40);
        return () => clearTimeout(id);
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
        if (img.complete) {
          const color = extractDominantColor(img);
          if (color) setTintColor(color);
        }
      }
    } else {
      setTintColor("180, 180, 180");
    }
  }, [selectedAnime]);

  useEffect(() => {
    if (selectedTag) {
      setCurrentPage(1);
      loadTag(selectedTag, 1);
    }
  }, [tagType, tagSort, tagYear]);

  useEffect(() => {
    async function loadPopular() {
      setBusy("tags-init");
      try {
        const tags = await (window.libraryApi.scraper as any).getPopularTags();
        setPopularTags(tags);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy("");
      }
    }
    loadPopular();
  }, []);

  async function loadTag(tag: string, page = 1) {
    setSelectedTag(tag);
    setTagData(null);
    setBusy("tag-load");
    setError("");
    try {
      let airDate: string[] = [];
      if (tagYear !== "全部") {
        const year = parseInt(tagYear);
        if (!isNaN(year)) {
          airDate = [`>=${year}-01-01`, `<${year + 1}-01-01`];
        }
      }
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const result = await (window.libraryApi.scraper as any).getAnimeByTag(tag, offset, ITEMS_PER_PAGE, {
        type: tagType,
        sort: tagSort,
        airDate: airDate.length > 0 ? airDate : undefined
      });
      setTagData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function openAnimeDetail(anime: NormalizedAnimeItem) {
    setSelectedAnime(anime);
    setDetailTab("概览");
    setBusy("weekly-details");
    
    // 重置所有资源状态
    setSelectedWeeklyDetail(null);
    setSelectedWeeklyResult(null);
    setWeeklySearchResults([]);
    setWeeklyEpisodes([]);
    setMikanDownloadResults([]);
    setSelectedSubtitleGroup("全部");
    setTintColor("180, 180, 180");

    try {
      // 1. 优先获取 Bangumi 官方详情，以获得最准确的标题用于后续搜索
      let detail: BangumiSubjectDetail | null = null;
      if (anime.bangumiId) {
        try {
          detail = await window.libraryApi.season.getDetail(anime.bangumiId);
          if (detail) setSelectedWeeklyDetail(detail);
        } catch (err) {
          console.error("Failed to fetch Bangumi detail:", err);
        }
      }

      // 使用官方标题或原始标题作为搜索关键字
      const keyword = detail?.title || anime.nameCn || anime.name;

      // 2. 并行获取在线播放资源和 Mikan 下载资源
      Promise.all([
        // 在线播放搜索
        window.libraryApi.online.search({ keyword }).then(async (searchResults) => {
          setWeeklySearchResults(searchResults);
          if (searchResults.length > 0) {
            const first = searchResults[0];
            setSelectedWeeklyResult(first);
            try {
              const eps = await window.libraryApi.online.episodes({ ruleUrl: first.rule_url || undefined, url: first.url });
              setWeeklyEpisodes(eps);
            } catch (err) {
              console.error("Failed to fetch episodes:", err);
            }
          }
        }).catch(err => console.error("Online search failed:", err)),

        // Mikan 资源搜索
        window.libraryApi.season.getMikanResources(keyword).then(results => {
          setMikanDownloadResults(results);
        }).catch(err => console.error("Mikan search failed:", err))
      ]);

    } catch (err) {
      console.error("Error in openAnimeDetail:", err);
    } finally {
      setBusy("");
    }
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
    const pId = String(personId).trim();
    if (!pId) return;
    setLoadingId(pId);
    try {
      let detail = null;
      const scraper = (window.libraryApi as any)?.scraper;
      if (scraper && typeof scraper.getPerson === "function") {
        detail = await scraper.getPerson(pId).catch(() => null);
      }
      if (!detail || !detail.infobox) {
        const resp = await fetch(`https://api.bgm.tv/v0/persons/${pId}`).catch(() => null);
        if (resp?.ok) detail = await resp.json();
      }
      setActivePerson(detail || { id: personId });
    } finally {
      setLoadingId(null);
    }
  }

  if (selectedAnime) {
    const showTitle = selectedAnime.nameCn || selectedAnime.name;
    const showCover = selectedAnime.images.large || selectedAnime.images.common || "";

    return (
      <div className="detail cover-tinted tagsTheme animeDetail" style={{ "--cover-rgb": tintColor, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' } as any}>
        <button className="backButtonGlass" onClick={() => setSelectedAnime(null)} style={{ position: 'sticky', top: '0', zIndex: 24, marginBottom: '14px', alignSelf: 'flex-start' }}>
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
                    <span style={{ fontSize: "24px", color: "#6366f1" }}>{selectedWeeklyDetail?.rating?.score?.toFixed(1) || selectedAnime.score?.toFixed(1) || "--"}</span>
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
                <p className="detailSynopsis">{selectedWeeklyDetail?.summary || "暂无简介"}</p>
              </section>
              <section className="detailSection">
                <h2>标签</h2>
                <div className="detailTags">
                  {selectedWeeklyDetail?.tags.map((tag, idx) => (
                    <div key={`${tag.name}-${idx}`} className="detailTag">
                      {tag.name} <span>{tag.count}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {detailTab === "角色" && (
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
          )}

          {detailTab === "制作人员" && (
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
          )}

          {detailTab === "播放资源" && (
            <div className="resourceContainer">
              <section className="resourceSubSection">
                <div className="resourceHeading">
                  <h3>在线播放 (Kazumi Rules)</h3>
                  <GlassSelect
                    value={selectedWeeklyResult?.url || ""}
                    onChange={async (val) => {
                      const found = weeklySearchResults.find(r => r.url === val);
                      if (found) {
                        setSelectedWeeklyResult(found);
                        const eps = await window.libraryApi.online.episodes({ ruleUrl: found.rule_url || undefined, url: found.url });
                        setWeeklyEpisodes(eps);
                      }
                    }}
                    options={weeklySearchResults.map(res => ({
                      value: res.url,
                      label: res.rule_name || "未知源"
                    }))}
                  />
                </div>
                <div className="onlineEpisodeGrid">
                  {weeklyEpisodes.map((ep, idx) => (
                    <button key={idx} className="onlineEpBtn" onClick={async () => {
                      await window.libraryApi.online.playUrl(ep.url, ep.title, ep.referer, { ruleUrl: ep.rule_url || undefined }, (selectedWeeklyDetail as any)?.external_id || (selectedWeeklyDetail as any)?.id);
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
        {activeCharacter && <CharacterModal character={activeCharacter as any} isLoading={!!loadingId} onClose={() => setActiveCharacter(null)} />}
        {activePerson && <PersonModal person={activePerson as any} isLoading={!!loadingId} onClose={() => setActivePerson(null)} />}
      </div>
    );
  }

  return (
    <div className="tagsPage">
      <header className="tagsHeader">
        <div className="headerLeft">
          {selectedTag && <button className="iconButton" onClick={() => setSelectedTag(null)}><ArrowLeft size={20} /></button>}
          <h1>{selectedTag ? `标签: ${selectedTag}` : "动画标签广场"}</h1>
        </div>
      </header>

      {!selectedTag ? (
        <div className="tagCloudGrid">
          {busy === "tags-init" && <div className="loadingState"><RefreshCw size={30} className="spin" /><span>加载标签中...</span></div>}
          {error && !busy && (
            <div className="errorState">
              <p>加载失败: {error}</p>
              <button className="primaryBtn" onClick={() => window.location.reload()}>重试</button>
            </div>
          )}
          {popularTags.map(tag => (
            <button key={tag.name} className="tagSquareCard" onClick={() => loadTag(tag.name)}>
              <span className="tagName">{tag.name}</span>
              <span className="tagCount">{tag.count.toLocaleString()}</span>
              <div className="tagDecoration"><Tag size={40} opacity={0.1} /></div>
            </button>
          ))}
          {popularTags.length === 0 && !busy && !error && <div className="emptyState">未获取到标签。</div>}
        </div>
      ) : (
        <div className="tagDetailView">
          <aside className="tagFilterSidebar">
            <section className="filterSection">
              <h3>类型</h3>
              <div className="filterChips">
                {[
                  { label: "动画", val: 2 },
                  { label: "书籍", val: 1 },
                  { label: "游戏", val: 4 },
                  { label: "音乐", val: 3 },
                  { label: "三次元", val: 6 }
                ].map(t => (
                  <button key={t.val} className={`filterChip ${tagType === t.val ? "active" : ""}`} onClick={() => setTagType(t.val)}>{t.label}</button>
                ))}
              </div>
            </section>
            <section className="filterSection">
              <h3>时间</h3>
              <div className="filterGrid">
                {["全部", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017"].map(y => (
                  <button key={y} className={`filterChip ${tagYear === y ? "active" : ""}`} onClick={() => setTagYear(y)}>{y === "全部" ? y : `${y}年`}</button>
                ))}
              </div>
            </section>
            <section className="filterSection">
              <h3>排序</h3>
              <div className="filterChips">
                {[
                  { label: "标注数", val: "rank" },
                  { label: "评分", val: "score" }
                ].map(s => (
                  <button key={s.val} className={`filterChip ${tagSort === s.val ? "active" : ""}`} onClick={() => setTagSort(s.val)}>{s.label}</button>
                ))}
              </div>
            </section>
          </aside>
          <div className="tagDetailContent">
            <div className="tagResultGrid compactGrid">
              {busy === "tag-load" && <div className="loadingState"><RefreshCw size={30} className="spin" /><span>加载中...</span></div>}
              {tagData?.data.map((anime) => (
                <button key={anime.bangumiId} className="animeCard" onClick={() => openAnimeDetail(anime)}>
                  <div className="animeCoverWrapper">
                    <Poster src={anime.images.large || anime.images.common || undefined} title={anime.nameCn || anime.name} />
                    {anime.score && <div className="animeScoreBadge">{anime.score.toFixed(1)}</div>}
                  </div>
                  <div className="animeInfo">
                    <strong title={anime.nameCn || anime.name}>{anime.nameCn || anime.name}</strong>
                    <span>{anime.airDate || "未知日期"}</span>
                  </div>
                </button>
              ))}
              {tagData?.data.length === 0 && !busy && <div className="emptyState">未找到该标签下的动画。</div>}
            </div>

            {tagData && tagData.total > ITEMS_PER_PAGE && (
              <div className="paginationBar">
                {(() => {
                  const totalPages = Math.ceil(tagData.total / ITEMS_PER_PAGE);
                  const pages = [];
                  const startPage = Math.max(1, Math.min(currentPage - 4, totalPages - 9));
                  const endPage = Math.min(totalPages, startPage + 9);

                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(i);
                  }

                  return (
                    <>
                      {pages.map(p => (
                        <button
                          key={p}
                          className={`pageBtn ${currentPage === p ? "active" : ""}`}
                          onClick={() => {
                            setCurrentPage(p);
                            loadTag(selectedTag!, p);
                          }}
                        >
                          {p}
                        </button>
                      ))}
                      {currentPage < totalPages && (
                        <button className="pageBtn" onClick={() => {
                          const next = currentPage + 1;
                          setCurrentPage(next);
                          loadTag(selectedTag!, next);
                        }}>»</button>
                      )}
                      <button className="pageBtn" onClick={() => {
                        setCurrentPage(totalPages);
                        loadTag(selectedTag!, totalPages);
                      }}>»|</button>

                      <div className="pageJump">
                        <input
                          type="number"
                          min="1"
                          max={totalPages}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = parseInt((e.target as HTMLInputElement).value);
                              if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                setCurrentPage(val);
                                loadTag(selectedTag!, val);
                              }
                            }
                          }}
                        />
                        <span>( {currentPage} / {totalPages} )</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
