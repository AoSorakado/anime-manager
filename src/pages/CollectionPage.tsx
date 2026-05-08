import { Star } from "lucide-react";
import type { MediaItem } from "../../electron/shared/types";
import { shortestTitle, seriesGroupingInfo } from "../utils";
import Poster from "../components/Poster";
import StatusBadge from "../components/StatusBadge";

export function CollectionPage({ items, onBack, onOpen }: { items: MediaItem[]; onBack: () => void; onOpen: (id: number) => void }) {
  const title = shortestTitle(items.map((item) => seriesGroupingInfo(item).title || item.title || item.clean_name));
  return (
    <div>
      <div className="backBar">
        <button className="textButton" onClick={onBack}>返回媒体库</button>
      </div>
      <header className="collectionHeader">
        <h1>{title}</h1>
        <p>{items.length} 个条目，按文件夹保留为不同季/篇章。点开任意条目后，二级目录会在详情页展开显示。</p>
      </header>
      <section className="mediaGrid">
        {items.map((item) => (
          <button key={item.id} className="posterCard" onClick={() => onOpen(item.id)}>
            <Poster mediaItemId={item.id} src={item.cover_path || undefined} title={item.title || item.clean_name} />
            <div className="posterMeta">
              <strong>{item.title || item.clean_name}</strong>
              <span>
                {(() => {
                  let rank;
                  try {
                    const meta = JSON.parse(item.metadata_json || "{}");
                    rank = meta?.rating?.rank;
                  } catch { /* ignore */ }
                  return (
                    <div className="cardStats">
                      {item.year && <span>{item.year}</span>}
                      {item.rating && <span className="rating"><Star size={11} fill="currentColor" /> {item.rating}</span>}
                      {rank && <span className="rank">#{rank}</span>}
                      {item.file_count && <span>{item.file_count} 个文件</span>}
                    </div>
                  );
                })()}
              </span>
              <StatusBadge status={item.watch_status} />
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
