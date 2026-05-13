import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Play, RefreshCw, Star, Wand2 } from "lucide-react";
import type { BangumiSubjectDetail, MediaFile, MediaItem, OnlineEpisode, OnlineSearchResult, RssItem, WatchStatus } from "../../electron/shared/types";
import { extractDominantColor } from "../LiquidGlassRuntime";
import { characterImage, formatSize, groupMediaFiles, localFileUrl, parseInfobox, parseJson, personImage, ratingConsensus, ratingDeviation, trimNumber, watchStatusOptions } from "../utils";
import CharacterModal from "../components/CharacterModal";
import GlassSelect from "../components/GlassSelect";
import InfoRow from "../components/InfoRow";
import PersonModal from "../components/PersonModal";
import Poster from "../components/Poster";
import RelatedSubjectsPanel from "../components/RelatedSubjectsPanel";
import SubjectModal from "../components/SubjectModal";

export function DetailPage({ id, onBack, onScrape, onChanged, isTransitioning }: { id: number; onBack: () => void; onScrape: () => void; onChanged: () => Promise<void>; isTransitioning: boolean }) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [activeCharacter, setActiveCharacter] = useState<Record<string, unknown> | null>(null);
  const [activePerson, setActivePerson] = useState<Record<string, unknown> | null>(null);
  const [activeSubject, setActiveSubject] = useState<Record<string, unknown> | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [refreshingById, setRefreshingById] = useState(false);
  const [isStaffExpanded, setIsStaffExpanded] = useState(false);
  const [showHeavyGrids, setShowHeavyGrids] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- Rich States from Subscriptions ---
  const [detailTab, setDetailTab] = useState("概览");
  const [weeklyEpisodes, setWeeklyEpisodes] = useState<OnlineEpisode[]>([]);
  const [mikanDownloadResults, setMikanDownloadResults] = useState<RssItem[]>([]);
  const [weeklySearchResults, setWeeklySearchResults] = useState<OnlineSearchResult[]>([]);
  const [selectedWeeklyResult, setSelectedWeeklyResult] = useState<OnlineSearchResult | null>(null);
  const [selectedSubtitleGroup, setSelectedSubtitleGroup] = useState<string>("全部");
  const [selectedWeeklyDetail, setSelectedWeeklyDetail] = useState<BangumiSubjectDetail | null>(null);
  const [tintColor, setTintColor] = useState<string>("220, 145, 165");

  // 动态取色：始终使用本地 cover://（CORS 保证），避免远程封面无 CORS 导致取色静默失败
  useEffect(() => {
    if (!item) {
      setTintColor("220, 145, 165");
      return;
    }

    let active = true;
    const src = `cover://${item.id}`;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (!active) return;
      try {
        const color = extractDominantColor(img);
        if (color) setTintColor(color);
      } catch {
        // Canvas 被污染或取色失败时静默回退
      }
    };

    img.onerror = () => {
      if (!active) return;
      // 本地封面加载失败，保持现状或回退
    };

    img.src = src;

    // 瞬间取色（如果已加载）
    if (img.complete && img.naturalWidth > 0) {
      try {
        const color = extractDominantColor(img);
        if (color && active) setTintColor(color);
      } catch { /* ignore */ }
    }

    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [item?.id]);

  useEffect(() => {
    if (!isTransitioning) {
      setShowHeavyGrids(true);
    } else {
      setShowHeavyGrids(false);
      const timer = setTimeout(() => setShowHeavyGrids(true), 800);
      return () => clearTimeout(timer);
    }
  }, [id, isTransitioning]);

  async function load() {
    const data = await window.libraryApi.media.get(id);
    const mediaItem = data.item;
    setItem(mediaItem);
    setFiles(data.files);

    const keyword = mediaItem.title || mediaItem.clean_name;

    setWeeklyEpisodes([]);
    setMikanDownloadResults([]);
    setWeeklySearchResults([]);
    setSelectedWeeklyDetail(null);

    if (mediaItem.external_id) {
      window.libraryApi.season.getDetail(Number(mediaItem.external_id)).then(detail => {
        setSelectedWeeklyDetail(detail);
      });
    }

    window.libraryApi.season.getMikanResources(keyword).then(results => {
      setMikanDownloadResults(results);
    });

    window.libraryApi.online.search({ keyword }).then(async (searchResults) => {
      setWeeklySearchResults(searchResults);
      if (searchResults.length > 0) {
        const first = searchResults[0];
        setSelectedWeeklyResult(first);
        const eps = await window.libraryApi.online.episodes({ ruleUrl: first.rule_url || undefined, url: first.url });
        setWeeklyEpisodes(eps);
      }
    });
  }

  useEffect(() => {
    setItem(null);
    setTintColor("180, 180, 180"); // 初始使用中性灰色，避免粉色闪烁
    void load();
  }, [id]);

  // 同步色值到全局 .app 容器，使背景流动能感知当前番剧颜色
  useEffect(() => {
    const app = document.querySelector(".app");
    if (app) {
      (app as HTMLElement).style.setProperty("--cover-rgb", tintColor);
    }
    return () => {
      if (app) (app as HTMLElement).style.removeProperty("--cover-rgb");
    };
  }, [tintColor]);

  const fileGroups = useMemo(() => item ? groupMediaFiles(files, item.folder_path) : [], [files, item?.folder_path]);

  if (!item) return <div className="panel">加载中</div>;
  const metadata = parseJson<Record<string, unknown>>(item.metadata_json, {});
  const tags = parseJson<Array<{ name: string; count?: number | null }>>(item.tags_json, []);
  const staff = parseJson<Array<Record<string, unknown>>>(item.staff_json, []);
  const characters = parseJson<Array<Record<string, unknown>>>(item.characters_json, []);
  const relations = parseJson<Array<Record<string, unknown>>>(item.relations_json, []);
  const infobox = parseInfobox(metadata.infobox).filter((row: { key: string; value: string }) => ["中文名", "话数", "放送开始", "放送星期", "原作", "导演", "脚本", "系列构成", "人物设定", "动画制作", "官方网站"].includes(row.key));
  const rating = metadata.rating as { total?: number; score?: number; rank?: number; count?: Record<string, number> } | undefined;

  async function setStatus(status: WatchStatus) {
    await window.libraryApi.media.setStatus(id, status);
    await load();
    await onChanged();
  }

  async function play(fileId: number) {
    try {
      await window.libraryApi.files.play(fileId);
      await load();
      await onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function refreshBangumiById() {
    if (!item?.external_id || refreshingById) return;
    setRefreshingById(true);
    try {
      await window.libraryApi.scraper.refreshBangumiById(item.id);
      await load();
      await onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingById(false);
    }
  }

  return (
    <div className="detail cover-tinted" style={{ "--cover-rgb": tintColor } as any}>
      <button className="backButtonGlass" onClick={onBack} style={{ position: 'sticky', top: '0', zIndex: 24, marginBottom: '14px' }}>
        <ArrowLeft size={16} />
        <span>返回媒体库</span>
      </button>

      <section className="detailHeroSection">
        <div className="detailHeroBg">
          {/* 始终渲染本地封面作为稳定底色 */}
          <img
            className="poster basePoster"
            src={`cover://${item.id}`}
            alt=""
          />
          {/* 如果有远程高清封面，则覆盖在上面 */}
          {selectedWeeklyDetail?.cover_url && (
            <img
              className="poster remotePoster"
              src={selectedWeeklyDetail.cover_url}
              alt=""
              crossOrigin="anonymous"
            />
          )}
        </div>
        <div className="detailHeroContent">
          <Poster mediaItemId={item.id} src={item.cover_path || undefined} title={item.title || item.clean_name} large isHero={true} />
          <div className="detailMainInfo">
            <h1>{item.title || item.clean_name}</h1>
            <div className="detailMetaRow">
              <div className="detailMetaItem">
                <label>放送开始</label>
                <span>{selectedWeeklyDetail?.air_date || item.air_date || "未知"}</span>
              </div>
              <div className="detailMetaItem">
                <label>评分透视</label>
                <div className="ratingScoreLine">
                  <span className="ratingScoreValue">{selectedWeeklyDetail?.rating?.score?.toFixed(1) || item.rating?.toFixed(1) || "--"}</span>
                  <div className="ratingStars">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} size={14} fill={s <= Math.round((selectedWeeklyDetail?.rating?.score || item.rating || 0) / 2) ? "#f1c40f" : "none"} stroke="#f1c40f" />
                    ))}
                  </div>
                </div>
              </div>
              <div className="detailMetaItem">
                <label>Bangumi Ranked</label>
                <span className="ratingRank">#{selectedWeeklyDetail?.rating?.rank || item.rank || "--"}</span>
              </div>
            </div>
            <div className="actions" style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
              <button className="primaryButton" onClick={onScrape}><Wand2 size={18} />重新刮削</button>
              {item.external_id && <button className="secondaryButton" disabled={refreshingById} onClick={() => void refreshBangumiById()}><RefreshCw size={18} className={refreshingById ? "spin" : ""} />刷新数据</button>}
              <button className="secondaryButton" onClick={() => void window.libraryApi.media.openFolder(item.folder_path)}>本地目录</button>
            </div>
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

      <section className="metadataGrid">
        <div className="panel metadataPanel infoPanel">
          <h2>条目信息</h2>
          <dl className="infoList">
            {infobox.map((row: { key: string; value: string }) => <InfoRow key={row.key} label={row.key} value={row.value} />)}
            {rating?.total ? <InfoRow label="评分人数" value={`${rating.total}`} /> : null}
            {item.rank ? <InfoRow label="排名" value={`#${item.rank}`} /> : null}
          </dl>
        </div>
        <div className="panel metadataPanel tagsPanel">
          <h2>标签</h2>
          <div className="tagCloud">
            {tags.slice(0, 28).map((tag, index) => <span key={`${tag.name}-${index}`}>{tag.name}{tag.count ? ` ${tag.count}` : ""}</span>)}
          </div>
        </div>

        <div className="panel metadataPanel charactersPanel">
          <h2>角色介绍</h2>
          <div className="characterGrid">
            {characters.map((character, index) => (
              <button className="characterCard" key={`${String(character.id)}-${index}`} disabled={loadingId === String(character.id)} onClick={async () => {
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
              }}>
                <Poster src={characterImage(character)} title={String(character.name_cn || character.name || "")} small />
                <div className="charMeta">
                  <strong>{loadingId === String(character.id) ? "加载中..." : String(character.name_cn || character.name || "")}</strong>
                  <span>{String(character.relation || "")}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel metadataPanel staffPanel">
          <h2>制作人员</h2>
          <div className="staffGrid">
            {(isStaffExpanded ? staff : staff.slice(0, 10)).map((person, index) => (
              <button className="staffCard" key={`${String(person.id)}-${index}`} disabled={loadingId === String(person.id)} onClick={async () => {
                const personId = String(person.id || "").trim();
                if (!personId) {
                  setActivePerson(person);
                  return;
                }
                setLoadingId(personId);
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
                  setActivePerson({ ...person, ...(detail || {}) });
                } finally {
                  setLoadingId(null);
                }
              }}>
                <Poster src={personImage(person)} title={String(person.name_cn || person.name || "")} small />
                <div className="staffMeta">
                  <strong>{loadingId === String(person.id) ? "加载中..." : String(person.name_cn || person.name || "")}</strong>
                  <span>{String(person.relation || "制作")}</span>
                </div>
              </button>
            ))}
          </div>
          {staff.length > 10 && (
            <button className="expandStaffBtn" onClick={() => setIsStaffExpanded(!isStaffExpanded)}>
              {isStaffExpanded ? "收起" : `展开全部 (${staff.length})`}
            </button>
          )}
        </div>

        <RelatedSubjectsPanel
          relations={relations}
          loadingId={loadingId}
          onOpenSubject={(s) => setActiveSubject(s)}
          onSetLoading={setLoadingId}
        />
      </section>

      <section className="fileTable">
        <h2>本地文件</h2>
        <div className="tableHead">
          <span>文件名</span>
          <span>大小</span>
          <span>修改时间</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {fileGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.key);
          const toggleGroup = () => {
            setExpandedGroups(prev => {
              const next = new Set(prev);
              if (next.has(group.key)) {
                next.delete(group.key);
              } else {
                next.add(group.key);
              }
              return next;
            });
          };
          return (
            <div className="fileGroup" key={group.key}>
              <div className="groupHeader" onClick={toggleGroup}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`groupToggle ${isExpanded ? 'expanded' : ''}`}>
                    <ChevronRight size={14} />
                  </span>
                  <strong>{group.title}</strong>
                </div>
                <span>{group.files.length} 个文件</span>
              </div>
              <div
                className={`fileGroupFiles ${isExpanded ? 'expanded' : 'collapsed'}`}
                style={{ maxHeight: isExpanded ? `${group.files.length * 48 + 12}px` : '0px' }}
              >
                {group.files.map((file) => (
                  <div className="tableRow" key={file.id}>
                    <span title={file.file_name}>{file.file_name}</span>
                    <span>{formatSize(file.size)}</span>
                    <span>{new Date(file.mtime).toLocaleDateString()}</span>
                    <GlassSelect
                      className="statusGlassSelect"
                      value={file.watched === 1 ? "watched" : "unwatched"}
                      onChange={async (value) => {
                        await window.libraryApi.files.setStatus(file.id, value);
                        await load();
                        await onChanged();
                      }}
                      options={watchStatusOptions}
                    />
                    <button className="playButton" onClick={(e) => { e.stopPropagation(); void play(file.id); }}><Play size={16} />播放</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <footer className="detailFoot">
        <span>来源：{item.provider || "manual"}</span>
        <span>路径：{item.folder_path}</span>
        <span>最后扫描：{item.last_scanned_at ? new Date(item.last_scanned_at).toLocaleString() : "无"}</span>
      </footer>
      {activeCharacter && <CharacterModal character={activeCharacter} isLoading={!!loadingId} onClose={() => setActiveCharacter(null)} />}
      {activePerson && <PersonModal person={activePerson} isLoading={!!loadingId} onClose={() => setActivePerson(null)} />}
      {activeSubject && <SubjectModal subject={activeSubject} isLoading={!!loadingId} onClose={() => setActiveSubject(null)} />}
    </div>
  );
}
