import { createPortal } from "react-dom";
import Poster from "./Poster";
import TranslatedSummary from "./TranslatedSummary";
import { parseInfobox, personImage } from "../utils";

export default function PersonModal({ person, isLoading, onClose }: { person: Record<string, unknown>; isLoading: boolean; onClose: () => void }) {
  const infobox = parseInfobox(person.infobox);
  const modal = (
    <div className="app theme-liquid">
      <div className="modalOverlay" onClick={onClose}>
        <div className="characterModal" onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: "28px", padding: "28px", maxWidth: "900px", position: "relative", maxHeight: "85vh", overflow: "hidden" }}>
          {/* 液态玻璃背景层 */}
          <div className="modalGlassBg" style={{ position: "absolute", inset: 0, zIndex: 0, filter: "url(#liquid-glass-filter)", background: "inherit", borderRadius: "inherit" }} />


          <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "28px", width: "100%", overflowY: "auto", maxHeight: "100%", paddingRight: "8px" }} className="custom-scrollbar">
            <div style={{ flexShrink: 0, position: "sticky", top: 0, alignSelf: "center" }}>
              <Poster src={personImage(person)} title={String(person.name_cn || person.name || "")} large />
            </div>
            <div className="characterModalInfo" style={{ flex: 1, minWidth: 0 }}>
              <h2>{String(person.name_cn || person.name || "")}</h2>
              <p className="subline" style={{ marginBottom: "16px" }}>{[person.name, person.career].filter(Boolean).join(" · ")}</p>

              {infobox.length > 0 ? (
                <div className="modalTags" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                  {infobox.map((info, idx) => (
                    <span key={idx} style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.4)", fontSize: "12px", color: "var(--ios27-ink)" }}>
                      <strong>{info.key}:</strong> {info.value}
                    </span>
                  ))}
                </div>
              ) : isLoading && (
                <p style={{ fontSize: "12px", opacity: 0.6, marginBottom: "16px" }}>正在抓取个人详细资料...</p>
              )}

              <TranslatedSummary text={String(person.summary || "")} fallback="暂无人物简介。" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
