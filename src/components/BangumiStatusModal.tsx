import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle, ExternalLink, Loader2, Wifi, WifiOff } from "lucide-react";
import type { BangumiStatusReport } from "../../electron/shared/types";

const SEVERITY_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  major: { icon: WifiOff, color: "#e74c3c", bg: "rgba(231,76,60,0.12)", label: "严重故障" },
  minor: { icon: AlertTriangle, color: "#f39c12", bg: "rgba(243,156,18,0.12)", label: "轻度异常" },
  resolved: { icon: CheckCircle, color: "#27ae60", bg: "rgba(39,174,96,0.12)", label: "已恢复" },
};

export default function BangumiStatusModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<BangumiStatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await window.libraryApi.bangumi.serviceStatus();
        if (!cancelled) {
          setReport(data);
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

  const overallConfig = report?.overall === "operational"
    ? { icon: Wifi, color: "#27ae60", bg: "rgba(39,174,96,0.15)", label: "一切正常" }
    : report?.overall === "degraded"
    ? { icon: AlertTriangle, color: "#f39c12", bg: "rgba(243,156,18,0.15)", label: "服务降级" }
    : { icon: WifiOff, color: "#e74c3c", bg: "rgba(231,76,60,0.15)", label: "服务中断" };

  const OverallIcon = overallConfig.icon;

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
            maxWidth: "800px",
            width: "min(800px, calc(100vw - 48px))",
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
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, color: "#2a1a24" }}>Bangumi 服务状态</h2>
            <button className="textButton modalClose" onClick={onClose}>
              关闭
            </button>
          </div>

          <div style={{ position: "relative", zIndex: 1, overflowY: "auto", flex: 1 }} className="custom-scrollbar">
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "32px", color: "#704d5f" }}>
                <Loader2 size={20} className="spin" />
                <span>正在查询 Bangumi 服务状态...</span>
              </div>
            )}
            {error && (
              <div style={{ padding: "24px", color: "#c0392b", textAlign: "center" }}>
                <p>查询失败：{error}</p>
              </div>
            )}
            {!loading && !error && report && (
              <>
                {/* 总体状态卡片 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "16px 20px",
                    borderRadius: "14px",
                    background: overallConfig.bg,
                    border: `1px solid ${overallConfig.color}30`,
                    marginBottom: "20px",
                  }}
                >
                  <OverallIcon size={28} color={overallConfig.color} />
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: overallConfig.color }}>
                      {overallConfig.label}
                    </div>
                    <div style={{ fontSize: "12px", color: "#704d5f", marginTop: "2px" }}>
                      数据来源：bgm-status.ry.mk · 更新于 {new Date(report.updated).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>

                {/* 事件列表 */}
                {report.incidents.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "4px" }}>
                    <strong style={{ color: "#2a1a24", fontSize: "14px" }}>近期事件</strong>
                    {report.incidents.map((inc) => {
                      const sev = SEVERITY_CONFIG[inc.severity] || SEVERITY_CONFIG.minor;
                      const SevIcon = sev.icon;
                      return (
                        <a
                          key={inc.id || inc.title}
                          href={inc.link || "https://bgm-status.ry.mk/"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            padding: "12px 14px",
                            borderRadius: "12px",
                            background: "rgba(255,255,255,0.45)",
                            backdropFilter: "blur(6px)",
                            cursor: "pointer",
                            transition: "background 0.15s",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.72)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.45)";
                          }}
                        >
                          <div
                            style={{
                              flexShrink: 0,
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: sev.bg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginTop: "1px",
                            }}
                          >
                            <SevIcon size={14} color={sev.color} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#2a1a24", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {inc.title}
                              </span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: sev.bg,
                                  color: sev.color,
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sev.label}
                              </span>
                            </div>
                            {inc.summary && (
                              <div
                                style={{
                                  fontSize: "12px",
                                  color: "#704d5f",
                                  marginTop: "4px",
                                  lineHeight: 1.5,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {inc.summary}
                              </div>
                            )}
                            <div style={{ fontSize: "11px", color: "#94627b", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <span>{new Date(inc.published || inc.updated).toLocaleString("zh-CN")}</span>
                              {inc.link && <ExternalLink size={11} />}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {report.incidents.length === 0 && (
                  <div style={{ padding: "24px", textAlign: "center", color: "#704d5f" }}>
                    暂无近期事件，Bangumi 服务运行正常。
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
