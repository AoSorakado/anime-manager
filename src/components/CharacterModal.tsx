import { useState } from "react";
import { createPortal } from "react-dom";
import PersonModal from "./PersonModal";
import Poster from "./Poster";
import TranslatedSummary from "./TranslatedSummary";
import { characterImage, parseInfobox, personImage } from "../utils";

export default function CharacterModal({ character, isLoading, onClose }: { character: Record<string, unknown>; isLoading: boolean; onClose: () => void }) {
  const actors = Array.isArray(character.actors) ? character.actors as Array<Record<string, unknown>> : [];
  const [activePerson, setActivePerson] = useState<Record<string, unknown> | null>(null);
  const [loadingPersonId, setLoadingPersonId] = useState("");
  const infobox = parseInfobox(character.infobox);

  async function openPerson(actor: Record<string, unknown>) {
    const personId = String(actor.id || actor.person_id || "").trim();
    setLoadingPersonId(personId || String(actor.name || actor.name_cn || ""));
    try {
      const detail = personId ? await window.libraryApi.scraper.getPerson(personId) : null;
      setActivePerson({ ...actor, ...(detail || {}) });
    } finally {
      setLoadingPersonId("");
    }
  }

  const modal = (
    <div className="app theme-liquid">
      <div className="modalOverlay" onClick={onClose}>
        <div className="characterModal" onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: "28px", padding: "28px", maxWidth: "900px", position: "relative", maxHeight: "85vh", overflow: "hidden" }}>
          {/* 液态玻璃背景层 */}
          <div className="modalGlassBg" style={{ position: "absolute", inset: 0, zIndex: 0, filter: "url(#liquid-glass-filter)", background: "inherit", borderRadius: "inherit" }} />

          <button className="textButton modalClose" onClick={onClose} style={{ zIndex: 2 }}>关闭</button>

          <div style={{ position: "relative", zIndex: 1, display: "flex", gap: "28px", width: "100%", overflowY: "auto", maxHeight: "100%", paddingRight: "8px" }} className="custom-scrollbar">
            <div style={{ flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start" }}>
              <Poster src={characterImage(character)} title={String(character.name_cn || character.name || "")} large />
            </div>
            <div className="characterModalInfo" style={{ flex: 1, minWidth: 0 }}>
              <h2>{String(character.name_cn || character.name || "")}</h2>
              <p className="subline" style={{ marginBottom: "16px" }}>{[character.name, character.relation].filter(Boolean).join(" · ")}</p>

              {infobox.length > 0 ? (
                <div className="modalTags" style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
                  {infobox.map((info, idx) => (
                    <span key={idx} style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,255,255,0.4)", fontSize: "12px", color: "var(--ios27-ink)" }}>
                      <strong>{info.key}:</strong> {info.value}
                    </span>
                  ))}
                </div>
              ) : isLoading && (
                <p style={{ fontSize: "12px", opacity: 0.6, marginBottom: "16px" }}>正在抓取详细属性...</p>
              )}

              {actors.length > 0 && (
                <div className="actorBlock" style={{ marginBottom: "20px" }}>
                  <h3 className="sideTitle">声优</h3>
                  <div className="actorGrid">
                    {actors.map((actor, index) => {
                      const actorId = String(actor.id || actor.person_id || `${actor.name || actor.name_cn}-${index}`);
                      return (
                        <button className="actorCard" key={actorId} onClick={() => void openPerson(actor)}>
                          <Poster src={personImage(actor)} title={String(actor.name_cn || actor.name || "")} small />
                          <span>{loadingPersonId === actorId ? "加载中" : String(actor.name_cn || actor.name || "")}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <TranslatedSummary text={String(character.summary || "")} fallback="暂无角色简介。" />
            </div>
          </div>
        </div>
      </div>
      {activePerson && <PersonModal person={activePerson} isLoading={!!loadingPersonId} onClose={() => setActivePerson(null)} />}
    </div>
  );

  return createPortal(modal, document.body);
}
