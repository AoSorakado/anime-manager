import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle, Clock, ExternalLink, Loader2, Server, Wifi, WifiOff, Zap } from "lucide-react";
import type { BangumiStatusReport } from "../../electron/shared/types";

const SEVERITY_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  major: { icon: WifiOff, color: "#e74c3c", bg: "rgba(231,76,60,0.12)", label: "严重故障" },
  minor: { icon: AlertTriangle, color: "#f39c12", bg: "rgba(243,156,18,0.12)", label: "轻度异常" },
  resolved: { icon: CheckCircle, color: "#27ae60", bg: "rgba(39,174,96,0.12)", label: "已恢复" },
};

const COMPONENT_STATUS_CONFIG = {
  operational: { icon: CheckCircle, color: "#27ae60", label: "正常" },
  degraded: { icon: AlertTriangle, color: "#f39c12", label: "降级" },
  outage: { icon: WifiOff, color: "#e74c3c", label: "不可用" },
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
    ? { icon: Wifi, color: "#27ae60", bg: "rgba(39,174,96,0.12)", label: "一切正常" }
    : report?.overall === "degraded"
    ? { icon: AlertTriangle, color: "#f39c12", bg: "rgba(243,156,18,0.12)", label: "部分服务异常" }
    : { icon: WifiOff, color: "#e74c3c", bg: "rgba(231,76,60,0.12)", label: "服务中断" };

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
            gap: "16px",
            padding: "24px 28px",
            maxWidth: "820px",
            width: "min(820px, calc(100vw - 48px))",
            position: "relative",
            maxHeight: "90vh",
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
          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", flexShrink: 0 }}>
            <h2 style={{ margin: 0, color: "#2a1a24", display: "flex", alignItems: "center", gap: "8px" }}>
              <Server size={22} />
              Bangumi 服务状态
            </h2>
          </div>

          <div style={{ position: "relative", zIndex: 1, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "16px" }} className="custom-scrollbar">
            {loading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "40px", color: "#704d5f" }}>
                <Loader2 size={22} className="spin" />
                <span>正在查询 Bangumi 服务状态...</span>
              </div>
            )}
            {error && (
              <div style={{ padding: "32px 24px", color: "#c0392b", textAlign: "center" }}>
                <WifiOff size={36} style={{ marginBottom: "8px", opacity: 0.6 }} />
                <p style={{ fontWeight: 600, margin: "0 0 4px" }}>查询失败</p>
                <p style={{ fontSize: "13px", color: "#94627b", margin: 0 }}>{error}</p>
              </div>
            )}
            {!loading && !error && report && (
              <>
                {/* ── 总体状态横幅 ── */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "18px 22px",
                    borderRadius: "16px",
                    background: overallConfig.bg,
                    border: `1px solid ${overallConfig.color}30`,
                  }}
                >
                  <OverallIcon size={30} color={overallConfig.color} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "17px", fontWeight: 700, color: overallConfig.color }}>
                      {overallConfig.label}
                    </div>
                    <div style={{ fontSize: "12px", color: "#704d5f", marginTop: "3px" }}>
                      {report.source === "feed"
                        ? "数据来源：bgm-status.ry.mk"
                        : "数据来源：本地连通性探测"}
                      {" · "}更新于 {new Date(report.updated).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <a
                    href="https://bgm-status.ry.mk/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      color: "#704d5f",
                      textDecoration: "none",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    状态页 <ExternalLink size={12} />
                  </a>
                </div>

                {/* ── 服务组件状态（探测模式） ── */}
                {report.source === "probe" && report.components && report.components.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#2a1a24", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Zap size={15} />
                      服务节点探测
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                      {report.components.map((comp) => {
                        const cfg = COMPONENT_STATUS_CONFIG[comp.status];
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={comp.name}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              background: "rgba(255,255,255,0.48)",
                              backdropFilter: "blur(6px)",
                              border: `1px solid ${cfg.color}20`,
                            }}
                          >
                            <Icon size={18} color={cfg.color} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: "13px", fontWeight: 600, color: "#2a1a24" }}>{comp.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "11px", color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                                {comp.statusCode != null && (
                                  <span style={{ fontSize: "11px", color: "#94627b", fontFamily: "monospace" }}>
                                    HTTP {comp.statusCode}
                                  </span>
                                )}
                                {comp.latencyMs != null && (
                                  <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11px", color: "#704d5f" }}>
                                    <Clock size={10} />
                                    {comp.latencyMs < 1000
                                      ? `${comp.latencyMs}ms`
                                      : `${(comp.latencyMs / 1000).toFixed(2)}s`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── 事件列表（Feed 模式） ── */}
                {report.incidents.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#2a1a24", display: "flex", alignItems: "center", gap: "6px" }}>
                      <AlertTriangle size={15} />
                      近期事件 ({report.incidents.length})
                    </div>
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
                            gap: "12px",
                            padding: "14px 16px",
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
                              width: "30px",
                              height: "30px",
                              borderRadius: "50%",
                              background: sev.bg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginTop: "1px",
                            }}
                          >
                            <SevIcon size={15} color={sev.color} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600, color: "#2a1a24" }}>
                                {inc.title}
                              </span>
                              <span
                                style={{
                                  fontSize: "10px",
                                  padding: "2px 7px",
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
                                  marginTop: "5px",
                                  lineHeight: 1.6,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                }}
                              >
                                {inc.summary}
                              </div>
                            )}
                            <div style={{ fontSize: "11px", color: "#94627b", marginTop: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <span>{new Date(inc.published || inc.updated).toLocaleString("zh-CN")}</span>
                              {inc.link && <ExternalLink size={11} />}
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* ── 事件列表为空 + Feed 模式 → 全正常 ── */}
                {report.incidents.length === 0 && report.source === "feed" && (
                  <div style={{ padding: "20px", textAlign: "center", color: "#704d5f" }}>
                    <CheckCircle size={28} style={{ color: "#27ae60", marginBottom: "8px" }} />
                    <p style={{ margin: 0, fontSize: "14px" }}>暂无近期事件，Bangumi 服务运行正常。</p>
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
