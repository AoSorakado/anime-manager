import { useMemo } from "react";
import Poster from "./Poster";
import { groupRelatedSubjects } from "../utils";

export default function RelatedSubjectsPanel({ relations, loadingId, onOpenSubject, onSetLoading }: { relations: Array<Record<string, unknown>>; loadingId: string | null; onOpenSubject: (subject: Record<string, unknown>) => void; onSetLoading: (id: string | null) => void }) {
  const groups = useMemo(() => groupRelatedSubjects(relations), [relations]);

  return (
    <div className="panel metadataPanel relatedPanel">
      <h2>关联条目</h2>
      {groups.length > 0 ? (
        <div className="relatedGroups">
          {groups.map((group) => (
            <div className="relatedGroup" key={group.label}>
              <h3>{group.label}</h3>
              <div className="relatedList">
                {group.items.slice(0, 8).map((subject, index) => (
                  <button
                    className="relatedSubject"
                    key={`${subject.id || subject.title}-${index}`}
                    disabled={loadingId === subject.id}
                    onClick={async () => {
                      if (!subject.id) {
                        onOpenSubject(subject);
                        return;
                      }
                      onSetLoading(subject.id);
                      try {
                        let detail = null;
                        const scraper = (window.libraryApi as any)?.scraper;

                        if (scraper && typeof scraper.getSubject === "function") {
                          detail = await scraper.getSubject(subject.id).catch(() => null);
                        }

                        if (!detail || !detail.summary) {
                          try {
                            const resp = await fetch(`https://api.bgm.tv/v0/subjects/${subject.id}`);
                            if (resp.ok) {
                              const bgmDetail = await resp.json();
                              detail = {
                                ...detail,
                                ...bgmDetail,
                                name_cn: bgmDetail.name_cn || bgmDetail.name,
                                summary: bgmDetail.summary || bgmDetail.short_summary
                              };
                            }
                          } catch (e) {
                            console.warn("Direct Bangumi API fetch failed:", e);
                          }
                        }

                        onOpenSubject({ ...subject, ...(detail || {}) });
                      } catch (err) {
                        console.error("RelatedSubject click error:", err);
                        onOpenSubject(subject);
                      } finally {
                        onSetLoading(null);
                      }
                    }}
                    title={`查看详情: ${subject.title}`}
                  >
                    <Poster src={subject.image} title={subject.title} small />
                    <div className="relatedMeta">
                      <strong>{loadingId === subject.id ? "加载中..." : subject.title}</strong>
                      <span className="relatedDetails">
                        {[
                          subject.year,
                          subject.type ? `[${subject.type}]` : null,
                          subject.score ? `★ ${subject.score}` : null,
                          subject.eps ? `${subject.eps}话` : null
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="emptyHint">暂无关联条目。重新刮削后会保存 Bangumi 的续集、衍生、书籍、曲目等关联信息。</p>
      )}
    </div>
  );
}
