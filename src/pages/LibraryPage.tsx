import { useMemo, useState } from "react";
import { RefreshCw, Sparkles, FolderPlus, Star } from "lucide-react";
import type { MediaItem, Source } from "../../electron/shared/types";
import type { CardTransitionPayload } from "../utils";
import { categoryMatches, groupLibraryEntries } from "../utils";
import GlassSelect from "../components/GlassSelect";
import Poster from "../components/Poster";
import StatusBadge from "../components/StatusBadge";

export function LibraryPage(props: {
  items: MediaItem[];
  sources: Source[];
  search: string;
  sort: string;
  filter: string;
  sourceFilter: string;
  categoryFilter: string;
  scraping: boolean;
  refreshingIds: boolean;
  syncingBangumi: boolean;
  onSearch: (value: string) => void;
  onSort: (value: string) => void;
  onFilter: (value: string) => void;
  onSourceFilter: (value: string) => void;
  onCategoryFilter: (value: string) => void;
  onBatchScrape: () => void;
  onBatchRefreshById: () => void;
  onSyncBangumi: () => void;
  onRefresh: () => void;
  onOpenItem: (id: number, transition: CardTransitionPayload) => void;
  onOpenCollection: (items: MediaItem[], transition: CardTransitionPayload) => void;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const visibleItems = useMemo(() => props.items.filter((item) => categoryMatches(item, props.categoryFilter)), [props.items, props.categoryFilter]);
  const entries = useMemo(() => groupLibraryEntries(visibleItems), [visibleItems]);

  return (
    <>
      <header className="toolbar">
        <input
          className="toolbarSearch"
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder={searchFocused || props.search ? "搜索标题、文件夹名、别名" : "搜索"}
        />
        <GlassSelect
          value={props.sourceFilter}
          onChange={props.onSourceFilter}
          options={[
            { value: "all", label: "全部媒体库" },
            ...props.sources.map((source) => ({ value: String(source.id), label: source.name }))
          ]}
        />
        <GlassSelect
          value={props.categoryFilter}
          onChange={props.onCategoryFilter}
          options={[
            { value: "all", label: "全部分类" },
            { value: "tv", label: "TV / 番剧" },
            { value: "movie", label: "剧场版 / 电影" },
            { value: "ova", label: "OVA / SP" },
            { value: "collection", label: "系列合集" },
            { value: "unknown", label: "未分类" }
          ]}
        />
        <GlassSelect
          value={props.sort}
          onChange={props.onSort}
          options={[
            { value: "created_at", label: "添加时间" },
            { value: "title", label: "标题 A-Z" },
            { value: "rating", label: "评分" },
            { value: "last_played_at", label: "最近播放" },
            { value: "last_scanned_at", label: "最后扫描" },
            { value: "file_count", label: "文件数量" }
          ]}
        />
        <GlassSelect
          value={props.filter}
          onChange={props.onFilter}
          options={[
            { value: "all", label: "全部" },
            { value: "unwatched", label: "想看" },
            { value: "watching", label: "在看" },
            { value: "watched", label: "看过" },
            { value: "on_hold", label: "搁置" },
            { value: "dropped", label: "抛弃" },
            { value: "needs_confirm", label: "待确认" },
            { value: "unmatched", label: "未匹配元数据" }
          ]}
        />
        <button className="iconButton" onClick={props.onRefresh} title="刷新">
          <RefreshCw size={18} />
        </button>
        <button className="secondaryButton" disabled={props.scraping} onClick={props.onBatchScrape}>
          <Sparkles size={18} className={props.scraping ? "spin" : ""} />
          <span>{props.scraping ? "刮削中" : "批量刮削"}</span>
        </button>
        <button className="secondaryButton" disabled={props.refreshingIds} onClick={props.onBatchRefreshById}>
          <RefreshCw size={18} className={props.refreshingIds ? "spin" : ""} />
          <span>{props.refreshingIds ? "刷新中" : "按 ID 刷新"}</span>
        </button>
        <button className="secondaryButton" disabled={props.syncingBangumi} onClick={props.onSyncBangumi}>
          <RefreshCw size={18} className={props.syncingBangumi ? "spin" : ""} />
          <span>{props.syncingBangumi ? "同步中" : "同步 Bangumi"}</span>
        </button>
      </header>
      <section className="mediaGrid">
        {entries.map((entry) => (
          <button
            key={entry.kind === "series" ? `series-${entry.key}` : `item-${entry.item.id}`}
            className="posterCard"
            onClick={(event) => {
              const transition = {
                rect: event.currentTarget.getBoundingClientRect(),
                element: event.currentTarget.querySelector(".poster") as HTMLElement,
                title: entry.title,
                coverPath: entry.coverItem.cover_path || undefined,
                mediaItemId: entry.coverItem.id
              };
              if (entry.kind === "series") {
                props.onOpenCollection(entry.items, transition);
              } else {
                props.onOpenItem(entry.item.id, transition);
              }
            }}
          >
            <Poster mediaItemId={entry.coverItem.id} src={entry.coverItem.cover_path || undefined} title={entry.title} />
            <div className="posterMeta">
              <strong>{entry.title}</strong>
              <span>{entry.kind === "series" ? (
                `${entry.items.length} 个条目 · ${entry.fileCount} 个文件`
              ) : (() => {
                let rank;
                try {
                  const meta = JSON.parse(entry.item.metadata_json || "{}");
                  rank = meta?.rating?.rank;
                } catch { /* ignore */ }
                return (
                  <div className="cardStats">
                    {entry.item.year && <span>{entry.item.year}</span>}
                    {entry.item.rating && <span className="rating"><Star size={11} fill="currentColor" /> {entry.item.rating}</span>}
                    {rank && <span className="rank">#{rank}</span>}
                    {entry.item.file_count && <span>{entry.item.file_count} 个文件</span>}
                  </div>
                );
              })()}</span>
              <StatusBadge status={entry.status} />
            </div>
          </button>
        ))}
        {entries.length === 0 && (
          <div className="emptyState">
            <FolderPlus size={34} />
            <div>添加一个本地媒体库路径后开始扫描。</div>
          </div>
        )}
      </section>
    </>
  );
}
