import { useEffect, useState } from "react";
import { translateToChinese } from "../utils";

export default function TranslatedSummary({ text, fallback }: { text: string; fallback: string }) {
  const [translated, setTranslated] = useState("");
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!text || text === fallback) return;
    const hasJapanese = /[\u3040-\u30ff]/.test(text);
    if (!hasJapanese) return;

    setLoading(true);
    translateToChinese(text).then(res => {
      if (res && res !== text) setTranslated(res);
    }).finally(() => setLoading(false));
  }, [text, fallback]);

  if (!text) return <p className="summaryText">{fallback}</p>;

  return (
    <div className="summaryBlock">
      <h3 className="sideTitle">简介</h3>
      <p className="summaryText" style={{ lineHeight: "1.7", opacity: 0.85, fontSize: "15px", whiteSpace: "pre-wrap" }}>
        {loading ? "正在尝试翻译..." : (showOriginal ? text : (translated || text))}
      </p>
      {translated && translated !== text && (
        <button className="textButton" onClick={() => setShowOriginal(!showOriginal)} style={{ marginTop: "8px", fontSize: "12px", opacity: 0.6 }}>
          {showOriginal ? "查看翻译" : "查看原文"}
        </button>
      )}
    </div>
  );
}
