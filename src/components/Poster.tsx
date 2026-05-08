import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { localFileUrl } from "../utils";

export default function Poster({ src, title, large, small, mediaItemId }: { src?: string; title: string; large?: boolean; small?: boolean; mediaItemId?: number; isHero?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src, mediaItemId]);
  const imageSrc = !failed && mediaItemId && src ? `cover://${mediaItemId}` : !failed && src && /^https?:\/\//i.test(src) ? src : !failed && src ? localFileUrl(src) : "";
  return (
    <div className={`poster ${large ? "large" : ""} ${small ? "small" : ""}`}>
      {imageSrc ? <img src={imageSrc} alt={title} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} /> : <Star size={large ? 44 : 28} />}
    </div>
  );
}
