import { useEffect, useState } from "react";
import { Search, Wand2 } from "lucide-react";
import type { MediaItem, MetadataCandidate } from "../../electron/shared/types";
import { summaryFromRaw, candidateMeta } from "../utils";
import Poster from "../components/Poster";

export function ScrapePage({ id, fallbackName, onBack, onApplied }: { id: number; fallbackName: string; onBack: () => void; onApplied: () => Promise<void> }) {
  const [keyword, setKeyword] = useState(fallbackName);
  const [item, setItem] = useState<MediaItem | null>(null);
  const [candidates, setCandidates] = useState<MetadataCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [didAutoSearch, setDidAutoSearch] = useState(false);

  async function load() {
    const data = await window.libraryApi.media.get(id);
    setItem(data.item);
    setCandidates(data.candidates);
  }

  async function search() {
    setBusy(true);
    try {
      if (item?.external_id) {
        await window.libraryApi.scraper.refreshBangumiById(id);
        await onApplied();
        return;
      }
      await window.libraryApi.scraper.searchBangumi(id, keyword);
      await load();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!didAutoSearch && candidates.length === 0 && keyword.trim()) {
      setDidAutoSearch(true);
      void search();
    }
  }, [candidates.length, didAutoSearch, keyword]);

  return (
    <div className="scrapePage">
      <div className="backBar">
        <button className="textButton" onClick={onBack}>返回详情</button>
      </div>
      <h1>刮削确认</h1>
      <div className="toolbar compact">
        <div className="searchBox">
          <Search size={18} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </div>
        <button className="primaryButton" onClick={search} disabled={busy}>
          <Wand2 size={18} />{busy ? "处理中" : item?.external_id ? `按 ID ${item.external_id} 刷新` : "搜索 Bangumi"}
        </button>
      </div>
      <section className="candidateList">
        {candidates.map((candidate) => (
          <div className="candidate" key={candidate.id}>
            <Poster src={candidate.cover_url || undefined} title={candidate.title} small />
            <div>
              <h3>{candidate.title}</h3>
              <p>{candidateMeta(candidate)}</p>
              <p className="candidateSummary">{candidate.raw_json ? summaryFromRaw(candidate.raw_json) : ""}</p>
            </div>
            <button className="primaryButton" onClick={async () => { await window.libraryApi.scraper.applyBangumi(id, candidate.external_id); await onApplied(); }}>选择</button>
          </div>
        ))}
      </section>
    </div>
  );
}
