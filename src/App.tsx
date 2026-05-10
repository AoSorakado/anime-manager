import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Activity, BarChart3, BookOpen, ChevronLeft, ChevronRight, Database, Heart, MonitorPlay, Palette, RefreshCw, Rss, Settings, Sparkles, Tag } from "lucide-react";
import { createRoot } from "react-dom/client";
import type { MediaItem, ScrapeIssue, Source, WatchStats } from "../electron/shared/types";
import LiquidGlassRuntime from "./LiquidGlassRuntime";
import "./styles.css";

// ─── Utils ─────────────────────────────────────────────────────
import { CardTransitionPayload, Page, scrollMainTo } from "./utils";

// ─── Basic Components (default exports) ────────────────────────
import BangumiCollectionModal from "./components/BangumiCollectionModal";
import BangumiStatusModal from "./components/BangumiStatusModal";
import BrowserOnlyNotice from "./components/BrowserOnlyNotice";
import NavButton from "./components/NavButton";
import SidebarInsights from "./components/SidebarInsights";
import WindowControls from "./components/WindowControls";

// ─── Page Components (named exports) ───────────────────────────
import { CollectionPage } from "./pages/CollectionPage";
import { DetailPage } from "./pages/DetailPage";
import { LibraryPage } from "./pages/LibraryPage";
import { LogsPage } from "./pages/LogsPage";
import { OnlinePage } from "./pages/OnlinePage";
import { ScrapeIssuesListPage } from "./pages/ScrapeIssuesListPage";
import { ScrapePage } from "./pages/ScrapePage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { SubscriptionsPage } from "./pages/SubscriptionsPage";
import { TagsPage } from "./pages/TagsPage";

// ─── App ────────────────────────────────────────────────────────

function App() {
  if (!window.libraryApi) {
    return <BrowserOnlyNotice />;
  }

  const [page, setPage] = useState<Page>("library");
  const [theme, setTheme] = useState<"default" | "liquid">(() => {
    return (localStorage.getItem("app_theme") as "default" | "liquid") || "default";
  });

  useEffect(() => {
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  // 使用 useRef 而非 useState 来管理 sidebar 状态，避免顶层重新渲染拖慢性能
  const sidebarRef = useRef<boolean>(localStorage.getItem("sidebar_collapsed") === "true");

  const toggleSidebar = () => {
    const isCollapsed = !sidebarRef.current;
    sidebarRef.current = isCollapsed;
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));

    const appEl = document.querySelector(".app");
    const sidebarEl = document.getElementById("main-sidebar");

    if (appEl && sidebarEl) {
      if (isCollapsed) {
        appEl.classList.add("sidebar-collapsed");
        sidebarEl.classList.add("collapsed");
      } else {
        appEl.classList.remove("sidebar-collapsed");
        sidebarEl.classList.remove("collapsed");
      }
    }
  };

  const [sources, setSources] = useState<Source[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedCollectionItems, setSelectedCollectionItems] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created_at");
  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [scanningSourceId, setScanningSourceId] = useState<number | null>(null);
  const [scraping, setScraping] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState(false);
  const [syncingBangumi, setSyncingBangumi] = useState(false);
  const [scrapeIssues, setScrapeIssues] = useState<ScrapeIssue[]>([]);
  const [watchStats, setWatchStats] = useState<WatchStats | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const lastCardTransition = useRef<CardTransitionPayload | null>(null);
  const [showBangumiCollections, setShowBangumiCollections] = useState(false);
  const [showBangumiStatus, setShowBangumiStatus] = useState(false);

  // 页面滚动位置持久化：导航前同步捕获，双 rAF 恢复（抵消 content-visibility 估算偏差）
  const scrollPositions = useRef<Record<string, number>>({});

  function captureScroll() {
    const main = document.querySelector(".main");
    if (main) {
      scrollPositions.current[page] = main.scrollTop;
    }
  }

  function goTo(next: Page) {
    if (next === page) return;
    captureScroll();
    setPage(next);
  }

  useEffect(() => {
    const saved = scrollPositions.current[page];
    if (saved !== undefined && saved > 0) {
      // 使用 requestAnimationFrame + setTimeout 确保 React 条件渲染的组件完整挂载且布局稳定
      const id = setTimeout(() => {
        scrollMainTo(saved);
        // 双重保险：处理 content-visibility 可能带来的异步高度变化
        requestAnimationFrame(() => scrollMainTo(saved));
      }, 32);
      return () => clearTimeout(id);
    } else {
      // 如果没有保存的位置，重置到顶部，避免继承上一个页面的滚动位置
      scrollMainTo(0);
    }
  }, [page]);

  const refreshSources = async () => setSources(await window.libraryApi.sources.list());

  const refreshSideInfo = async () => {
    try {
      const [issues, stats, bgmStatus] = await Promise.all([
        window.libraryApi.media.issues(200),
        window.libraryApi.media.watchStats(),
        window.libraryApi.bangumi.serviceStatus().catch(() => null)
      ]);

      // 尝试获取收藏总数（如果已配置 Token）
      let bgmCollectionTotal: number | undefined = undefined;
      try {
        const collections = await window.libraryApi.bangumi.listCollections();
        bgmCollectionTotal = collections.length;
      } catch (err) {
        console.warn("Failed to fetch Bangumi collections:", err);
      }

      setScrapeIssues(issues);
      setWatchStats({
        ...stats,
        bangumi_status: bgmStatus?.overall || "operational", // 默认正常
        bangumi_collection_total: bgmCollectionTotal
      });
    } catch (error) {
      console.error("Failed to refresh side info:", error);
    }
  };

  const refreshItems = async () => {
    const freshItems = await window.libraryApi.media.list({ search, sort, filter, sourceId: sourceFilter === "all" ? null : Number(sourceFilter) });

    let processedItems = freshItems;
    if (sort === "title") {
      processedItems = [...freshItems].sort((a, b) => {
        const ta = a.title || a.clean_name || a.folder_name || "";
        const tb = b.title || b.clean_name || b.folder_name || "";
        return ta.localeCompare(tb, "zh-CN", { numeric: true, sensitivity: "base" });
      });
    }

    setItems(processedItems);
    void refreshSideInfo();
    setSelectedCollectionItems((current) => {
      if (current.length === 0) return current;
      const ids = new Set(current.map((item) => item.id));
      const refreshed = processedItems.filter((item) => ids.has(item.id));
      return refreshed.length > 0 ? refreshed : current;
    });
    return processedItems;
  };

  useEffect(() => {
    void refreshSources();
    void refreshSideInfo();

    const handleRefresh = () => void refreshSideInfo();
    window.addEventListener("refresh-side-info", handleRefresh);
    return () => window.removeEventListener("refresh-side-info", handleRefresh);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, sort, filter, sourceFilter]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId), [items, selectedId]);

  async function addSource() {
    setBusy("添加媒体库");
    try {
      const source = await window.libraryApi.sources.addLocal("");
      if (source) {
        await refreshSources();
        await scanSource(source.id);
      }
    } finally {
      setBusy("");
    }
  }

  async function scanSource(sourceId: number) {
    if (scanningSourceId !== null) return;
    setBusy("扫描中");
    setScanningSourceId(sourceId);
    try {
      await window.libraryApi.sources.scan(sourceId);
      await refreshItems();
    } finally {
      setBusy("");
      setScanningSourceId(null);
    }
  }

  async function batchScrape() {
    if (scraping) return;
    setScraping(true);
    setBusy("刮削中");
    try {
      await window.libraryApi.scraper.batchSearchBangumi({ unmatchedOnly: true, autoApplyThreshold: 92, delayMs: 1100 });
      await refreshItems();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
      setScraping(false);
    }
  }

  async function batchRefreshById() {
    if (refreshingIds) return;
    setRefreshingIds(true);
    setBusy("按 ID 刷新中");
    try {
      const result = await window.libraryApi.scraper.batchRefreshBangumiById({ delayMs: 900 });
      window.alert(`按 ID 刷新完成：成功 ${result.refreshed}/${result.total}，失败 ${result.failed}`);
      await refreshItems();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
      setRefreshingIds(false);
    }
  }

  async function syncBangumi() {
    if (syncingBangumi) return;
    setSyncingBangumi(true);
    setBusy("同步中");
    try {
      const result = await window.libraryApi.bangumi.syncLocalStatus();
      window.alert(`Bangumi 同步完成：成功 ${result.synced}，跳过 ${result.skipped}，失败 ${result.failed}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
      setSyncingBangumi(false);
    }
  }

  function runRouteTransition(kind: "enter" | "exit", payload: CardTransitionPayload, update: () => void) {
    const root = document.documentElement;
    const sourceElement = payload.element;
    if (sourceElement) {
      sourceElement.style.setProperty("view-transition-name", "shared-poster");
    }

    document.documentElement.classList.add("view-transitioning");
    const transitionApi = (document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }).startViewTransition;
    if (!transitionApi) {
      document.documentElement.classList.remove("view-transitioning");
      flushSync(update);
      return;
    }

    setIsTransitioning(true);
    const transition = transitionApi.call(document, () => {
      flushSync(update);
    });

    void transition.finished.finally(() => {
      setIsTransitioning(false);
      document.documentElement.classList.remove("view-transitioning");
      root.classList.remove("route-enter-card", "route-exit-card");
      if (sourceElement) {
        sourceElement.style.removeProperty("view-transition-name");
      }
    });
  }

  return (
    <>
      <div className={`app theme-${theme} page-${page} ${sidebarRef.current ? "sidebar-collapsed" : ""}`}>
        {/* Hyper-Liquid Distortion Filter */}
        <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
          <defs>
            <filter id="liquid-glass-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.01 0.008" numOctaves="1" result="turbulence" />
              <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="15" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>

        <div className="ambientBackground">
          <div className="blob blob1"></div>
          <div className="blob blob2"></div>
          <div className="blob blob3"></div>
          <div className="blob blob4"></div>
          <div className="blob blob5"></div>
          <div className="blob blob6"></div>
          <div className="blob blob7"></div>
          <div className="blob blob8"></div>
          <div className="blob blob9"></div>
          <div className="blob blob10"></div>
        </div>
        <div className="dragTitlebar"></div>
        <WindowControls />
        <aside className={`sidebar ${sidebarRef.current ? "collapsed" : ""}`} id="main-sidebar">
          <div className="sidebarHeader">
            <div className="brand">
              <BookOpen size={22} />
              <span className="sidebar-text-only">Anime Library</span>
            </div>
            <button className="sidebarToggle" onClick={toggleSidebar} title="折叠/展开侧边栏">
              <ChevronLeft size={18} className="icon-collapse" />
              <ChevronRight size={18} className="icon-expand" />
            </button>
          </div>
          <nav className="sidebarNav">
            <NavButton active={page === "library"} icon={<MonitorPlay size={20} />} label="本地库" onClick={() => goTo("library")} />
            <NavButton active={page === "subscriptions"} icon={<Rss size={20} />} label="订阅更新" onClick={() => goTo("subscriptions")} />
            <NavButton active={page === "tags"} icon={<Tag size={20} />} label="动画标签" onClick={() => goTo("tags")} />
            <NavButton active={page === "scrape"} icon={<Sparkles size={20} />} label="刮削修正" onClick={() => goTo("scrape")} />
            <NavButton active={page === "stats"} icon={<BarChart3 size={20} />} label="统计页" onClick={() => goTo("stats")} />
            <NavButton active={false} icon={<Heart size={20} />} label="我的收藏" onClick={() => setShowBangumiCollections(true)} />
            <NavButton active={false} icon={<Activity size={20} />} label="服务状态" onClick={() => setShowBangumiStatus(true)} />
            <NavButton active={page === "settings"} icon={<Settings size={20} />} label="应用设置" onClick={() => goTo("settings")} />
            <NavButton active={page === "logs"} icon={<Database size={20} />} label="运行日志" onClick={() => goTo("logs")} />
          </nav>
          <div className="themeToggleArea">
            <button
              className="themeToggleButton"
              onClick={() => setTheme(theme === "default" ? "liquid" : "default")}
              title="切换液态玻璃主题"
            >
              <Palette size={18} />
              <span className="sidebar-text-only">{theme === "default" ? "默认" : "液态"}</span>
            </button>
          </div>
          <div className="sourceList sidebar-content-only">
            <div className="sideTitle">来源</div>
            {sources.map((source) => (
              <button key={source.id} className="sourceButton" onClick={() => void scanSource(source.id)}>
                <span>{source.name}</span>
                <RefreshCw size={14} className={scanningSourceId === source.id ? "spin" : ""} />
              </button>
            ))}
          </div>
          <div className="sidebar-content-only">
            <SidebarInsights
              issues={scrapeIssues}
              stats={watchStats}
              onOpenIssue={(id) => {
                captureScroll();
                setSelectedId(id);
                setPage("scrape-detail");
                scrollMainTo(0);
              }}
            />
          </div>
        </aside>

        <main className="main">
          <LiquidGlassRuntime />
          <div className="pageTransition">
            {/* ── Conditional rendering: only the active page mounts ── */}
            {page === "library" && (
              <LibraryPage
                items={items}
                sources={sources}
                search={search}
                sort={sort}
                filter={filter}
                sourceFilter={sourceFilter}
                categoryFilter={categoryFilter}
                scraping={scraping}
                refreshingIds={refreshingIds}
                syncingBangumi={syncingBangumi}
                onSearch={setSearch}
                onSort={setSort}
                onFilter={setFilter}
                onSourceFilter={setSourceFilter}
                onCategoryFilter={setCategoryFilter}
                onBatchScrape={batchScrape}
                onBatchRefreshById={batchRefreshById}
                onSyncBangumi={syncBangumi}
                onRefresh={refreshItems}
                onOpenItem={(id: number, transition: CardTransitionPayload) => {
                  lastCardTransition.current = transition;
                  captureScroll();
                  runRouteTransition("enter", transition, () => {
                    setSelectedId(id);
                    setPage("detail");
                    scrollMainTo(0);
                  });
                }}
                onOpenCollection={(collectionItems: MediaItem[], transition: CardTransitionPayload) => {
                  lastCardTransition.current = transition;
                  captureScroll();
                  runRouteTransition("enter", transition, () => {
                    setSelectedCollectionItems(collectionItems);
                    setPage("collection");
                    scrollMainTo(0);
                  });
                }}
              />
            )}

            {page === "settings" && (
              <SettingsPage
                sources={sources}
                scanningSourceId={scanningSourceId}
                onAddSource={addSource}
                onSourceAdded={refreshSources}
                onSourcesChanged={async () => {
                  const freshSources = await window.libraryApi.sources.list();
                  setSources(freshSources);
                  if (sourceFilter !== "all" && !freshSources.some((source) => String(source.id) === sourceFilter)) {
                    setSourceFilter("all");
                  }
                  await refreshItems();
                }}
                onScan={scanSource}
                onNamesChanged={async () => {
                  await refreshItems();
                }}
              />
            )}

            {page === "logs" && <LogsPage />}

            {page === "stats" && (
              <StatsPage stats={watchStats} onRefresh={refreshSideInfo} />
            )}

            {page === "subscriptions" && (
              <SubscriptionsPage onRefresh={refreshSideInfo} />
            )}

            {page === "online" && (
              <OnlinePage onRefresh={refreshSideInfo} />
            )}

            {page === "tags" && <TagsPage />}

            {page === "collection" && (
              <CollectionPage
                items={selectedCollectionItems}
                onBack={() => {
                  const transition = lastCardTransition.current;
                  captureScroll();
                  if (transition) {
                    runRouteTransition("exit", transition, () => {
                      setPage("library");
                    });
                  } else {
                    goTo("library");
                  }
                }}
                onOpen={(id: number) => {
                  captureScroll();
                  setSelectedId(id);
                  setPage("detail");
                  scrollMainTo(0);
                }}
              />
            )}

            {page === "detail" && selectedId && (
              <DetailPage
                key={selectedId}
                id={selectedId}
                onBack={() => {
                  const transition = lastCardTransition.current;
                  captureScroll();
                  if (transition) {
                    runRouteTransition("exit", transition, () => {
                      setPage("library");
                    });
                  } else {
                    goTo("library");
                  }
                }}
                onScrape={() => {
                  captureScroll();
                  setPage("scrape-detail");
                }}
                onChanged={async () => {
                  await refreshItems();
                  await refreshSideInfo();
                }}
                isTransitioning={isTransitioning}
              />
            )}

            {page === "scrape" && (
              <ScrapeIssuesListPage
                issues={scrapeIssues}
                onRefresh={refreshSideInfo}
                onOpen={(id: number) => {
                  captureScroll();
                  setSelectedId(id);
                  setPage("scrape-detail");
                }}
              />
            )}

            {page === "scrape-detail" && selectedId && (
              <ScrapePage
                id={selectedId}
                fallbackName={selected?.clean_name || ""}
                onBack={() => goTo("scrape")}
                onApplied={async () => {
                  await refreshItems();
                  goTo("scrape");
                  scrollMainTo(0);
                }}
              />
            )}
          </div>
        </main>
      </div>
      {showBangumiCollections && (
        <BangumiCollectionModal onClose={() => setShowBangumiCollections(false)} />
      )}
      {showBangumiStatus && (
        <BangumiStatusModal onClose={() => setShowBangumiStatus(false)} />
      )}
    </>
  );
}

// ─── Mount ──────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
