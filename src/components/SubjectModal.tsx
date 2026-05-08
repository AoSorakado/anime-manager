import { createPortal } from "react-dom";
import Poster from "./Poster";
import TranslatedSummary from "./TranslatedSummary";
import { parseInfobox } from "../utils";

export default function SubjectModal({ subject, isLoading, onClose }: { subject: Record<string, unknown>; isLoading: boolean; onClose: () => void }) {
  const infobox = parseInfobox(subject.infobox);
  const images = (subject.images as any) || {};
  const posterUrl = images.large || images.medium || images.common || images.grid || subject.image || "";

  const modal = (
    <div className="app theme-liquid">
      <div className="modalOverlay" onClick={onClose}>
        <div className="characterModal" onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: "28px", padding: "28px", maxWidth: "900px", position: "relative", maxHeight: "85vh", overflow: "hidden" }}>
          <div className="modalGlassBg" style={{ position: "absolute", inset: 0, zIndex: 0, filter: "url(#liquid-glass-filter)", background: "inherit", borderRadius: "inherit" }} />
          <button className="textButton modalClose" onClick={onClose} style={{ zIndex: 2 }}>关闭</button>

          <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "28px", width: "100%", overflowY: "auto", maxHeight: "100%", paddingRight: "8px" }} className="custom-scrollbar">
            <div style={{ flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start" }}>
              <Poster src={posterUrl} title={String(subject.name_cn || subject.name || "作品详情")} large />
            </div>
            <div className="characterModalInfo" style={{ flex: 1, minWidth: 0 }}>
              <h2>{String(subject.name_cn || subject.title || subject.name || "未知作品")}</h2>
              <p className="subline" style={{ marginBottom: "16px" }}>{String(subject.name || subject.name_cn || "")}</p>

              <div className="modalTags" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                {(subject.score || (subject as any).rating?.score) && (
                  <span style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,193,7,0.3)", fontSize: "12px", color: "#d4a017", fontWeight: "bold" }}>
                    ★ {subject.score || (subject as any).rating?.score}
                  </span>
                )}
                {subject.type && <span style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.4)", fontSize: "12px", color: "#8c365b" }}>{String(subject.type)}</span>}
                {infobox.map((info, idx) => (
                  <span key={idx} style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.4)", fontSize: "12px", color: "var(--ios27-ink)" }}>
                    <strong>{info.key}:</strong> {info.value}
                  </span>
                ))}
              </div>

              <TranslatedSummary text={String(subject.summary || "")} fallback={isLoading ? "正在从 Bangumi 抓取详细资料..." : "暂无作品简介。"} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
