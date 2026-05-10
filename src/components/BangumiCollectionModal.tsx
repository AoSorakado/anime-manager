import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { BangumiCollectionEntry } from "../../electron/shared/types";
import { statusColor } from "../utils";

const STATUS_TYPE_LABELS: Record<number, string> = {
  1: "想看",
  2: "看过",
  3: "在看",
  4: "搁置",
  5: "抛弃",
};

const STATUS_ORDER = [3, 1, 2, 4, 5]; // 在看 → 想看 → 看过 → 搁置 → 抛弃

export default function BangumiCollectionModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<BangumiCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await window.libraryApi.bangumi.listCollections();
        if (!cancelled) {
          setEntries(data);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const grouped: Record<number, BangumiCollectionEntry[]> = {};
  for (const entry of entries) {
    const key = entry.collection_type || 0;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(entry);
  }

  /** 按 Bangumi 收藏类型映射到本地 WatchStatus */
  function toWatchStatus(type: number) {
    if (type === 1) return "unwatched";
    if (type === 2) return "watched";
    if (type === 3) return "watching";
    if (type === 4) return "on_hold";
    if (type === 5) return "dropped";
    return "unwatched";
  }

  const modal = (
    <div className="app theme-liquid">
      <div className="modalOverlay" onClick={onClose}>
        <div
          className="characterModal"
          onClick={(event) => event.stopPropagation()}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "24px 28px",
            maxWidth: "960px",
            width: "min(960px, calc(100vw - 48px))",
            position: "relative",
            maxHeight: "85vh",
            overflow: "hidden",
          }}
        >
          <div
            className="modalGlassBg"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              filter: "url(#liquid-glass-filter)",
              background: "inherit",
              borderRadius: "inherit",
            }}
          />
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center" }}>
            <h2 style={{ margin: 0, color: "#2a1a24" }}>Bangumi 我的收藏</h2>
          </div>

          <div
            style={{ position: "relative", zIndex: 1, overflowY: "auto", flex: 1 }}
            className="custom-scrollbar"
          >
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "32px", color: "#704d5f" }}>
                <Loader2 size={20} className="spin" />
                <span>正在从 Bangumi 加载收藏数据...</span>
              </div>
            )}
            {error && (
              <div style={{ padding: "24px", color: "#c0392b", textAlign: "center" }}>
                <p>加载失败：{error}</p>
                <p style={{ fontSize: "13px", color: "#94627b", marginTop: "8px" }}>请确保已在设置中填写有效的 Bangumi Access Token。</p>
              </div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div style={{ padding: "32px", color: "#704d5f", textAlign: "center" }}>暂无收藏数据。</div>
            )}
            {!loading && !error && entries.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingBottom: "4px" }}>
                {STATUS_ORDER.map((type) => {
                  const items = grouped[type];
                  if (!items || items.length === 0) return null;
                  const watchStatus = toWatchStatus(type);
                  const color = statusColor(watchStatus);
                  return (
                    <div key={type}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                          paddingLeft: "4px",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: color,
                          }}
                        />
                        <strong style={{ color: "#2a1a24", fontSize: "15px" }}>
                          {STATUS_TYPE_LABELS[type]} ({items.length})
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: "6px",
                        }}
                      >
                        {items.map((entry) => (
                          <div
                            key={entry.subject_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "8px 10px",
                              borderRadius: "10px",
                              background: "rgba(255,255,255,0.45)",
                              backdropFilter: "blur(6px)",
                              cursor: "pointer",
                              transition: "background 0.15s",
                            }}
                            title={entry.subject_name_cn || entry.subject_name}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.7)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.45)";
                            }}
                            onClick={() => {
                              window.open(`https://bgm.tv/subject/${entry.subject_id}`, "_blank");
                            }}
                          >
                            {/* 缩略图 */}
                            <img
                              src={
                                entry.subject_images?.grid ||
                                entry.subject_images?.small ||
                                entry.subject_images?.common ||
                                ""
                              }
                              alt=""
                              style={{
                                width: "40px",
                                height: "56px",
                                borderRadius: "6px",
                                objectFit: "cover",
                                flexShrink: 0,
                                background: "rgba(0,0,0,0.08)",
                              }}
                              loading="lazy"
                            />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "#2a1a24",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {entry.subject_name_cn || entry.subject_name}
                              </div>
                              {entry.subject_name_cn && entry.subject_name && entry.subject_name !== entry.subject_name_cn && (
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "#704d5f",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    marginTop: "1px",
                                  }}
                                >
                                  {entry.subject_name}
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                                {entry.rate !== undefined && entry.rate > 0 && (
                                  <span style={{ fontSize: "11px", color: "#d4a017", fontWeight: 600 }}>
                                    ★ {entry.rate}
                                  </span>
                                )}
                                {entry.subject_eps !== undefined && entry.subject_eps > 0 && (
                                  <span style={{ fontSize: "11px", color: "#94627b" }}>
                                    {entry.subject_eps} 话
                                  </span>
                                )}
                                {entry.private && (
                                  <span style={{ fontSize: "10px", padding: "1px 4px", borderRadius: "4px", background: "rgba(0,0,0,0.08)", color: "#704d5f" }}>
                                    私密
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
