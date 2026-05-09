import { useEffect, useRef } from "react";

type RGB = { r: number; g: number; b: number };

const CARD_SELECTOR = [
  ".posterCard",
  ".mikanWeeklyCard",
  ".mikanSearchResultCard",
  ".mikanShowItem",
  ".onlineResultCard",
  ".relatedSubject",
  ".characterCard",
  ".timeMachineCard",
].join(",");

const IMAGE_SELECTOR = [
  ".poster img",
  "img",
].join(",");

// 全局色彩缓存：同一图片 URL 只采样一次
const colorCache = new Map<string, RGB>();

function clamp(value: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function hashColor(input: string): RGB {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  // 黄金比例分布色相，确保不同条目产生差异化的玻璃色调
  const hue = ((hash >>> 0) * 0.618033988749895) % 1;
  const sat = 0.42 + ((hash >>> 8) & 0xff) / 255 * 0.28;
  const lit = 0.46 + ((hash >>> 16) & 0xff) / 255 * 0.14;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
  const p = 2 * lit - q;

  return {
    r: Math.round(clamp(hue2rgb(p, q, hue + 1/3) * 255)),
    g: Math.round(clamp(hue2rgb(p, q, hue) * 255)),
    b: Math.round(clamp(hue2rgb(p, q, hue - 1/3) * 255)),
  };
}

function tuneColor(rgb: RGB): RGB {
  // HSL 色彩空间调色：保持自然色相，温和提升饱和度/亮度适配液态玻璃 UI
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  
  // 饱和度：保留原色氛围但增强至可见范围，上限防刺眼
  // 饱和度：保持克制，避免过饱和导致刺眼。上限进一步压低。
  const targetS = s < 0.05 ? s : Math.min(0.60, Math.max(0.15, s * 0.9 + 0.02));
  // 亮度：保持适中，既不过亮也不过暗，增强文字可读性
  const targetL = Math.min(0.65, Math.max(0.42, l * 0.5 + 0.25));
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;

  return {
    r: Math.round(clamp(hue2rgb(p, q, h + 1/3) * 255)),
    g: Math.round(clamp(hue2rgb(p, q, h) * 255)),
    b: Math.round(clamp(hue2rgb(p, q, h - 1/3) * 255)),
  };
}

async function waitForImage(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) return;

  try {
    if (typeof img.decode === "function") {
      await img.decode();
      return;
    }
  } catch {
    // decode 失败时继续走 load/error 监听。
  }

  await new Promise<void>((resolve) => {
    const done = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", done);
      resolve();
    };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    setTimeout(done, 1500);
  });
}

function sampleImageElement(img: HTMLImageElement): RGB | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const canvas = document.createElement("canvas");
  const size = 20; // 适度提高分辨率以获得更准确的主导色
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  let r = 0, g = 0, b = 0, totalWeight = 0;
  const cx = size / 2, cy = size / 2;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const idx = (py * size + px) * 4;
      const alpha = data[idx + 3];
      if (alpha < 128) continue;

      const rr = data[idx], gg = data[idx + 1], bb = data[idx + 2];
      const brightness = (rr + gg + bb) / 3;
      if (brightness > 248 || brightness < 12) continue;

      // 计算像素饱和度，过滤噪点
      const pixelMax = Math.max(rr, gg, bb), pixelMin = Math.min(rr, gg, bb);
      const pixelSat = pixelMax > 0 ? (pixelMax - pixelMin) / pixelMax : 0;
      if (pixelSat < 0.08 && brightness > 50 && brightness < 230) continue;

      // 中心加权：封面主体通常居中
      const dx = (px - cx) / cx, dy = (py - cy) / cy;
      const distWeight = 1 + Math.max(0, 1 - (dx * dx + dy * dy));
      
      // 饱和度加权：色彩越丰富对玻璃色调贡献越大
      const satWeight = 0.4 + pixelSat * 1.8;
      
      const weight = distWeight * satWeight;
      r += rr * weight;
      g += gg * weight;
      b += bb * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight < 1) return null;
  return tuneColor({ r: r / totalWeight, g: g / totalWeight, b: b / totalWeight });
}

export function extractDominantColor(img: HTMLImageElement): string | null {
  const rgb = sampleImageElement(img);
  if (!rgb) return null;
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

async function sampleByClonedImage(src: string): Promise<RGB | null> {
  return await new Promise((resolve) => {
    const clone = new Image();
    clone.crossOrigin = "anonymous";
    clone.decoding = "async";
    clone.onload = () => {
      try {
        resolve(sampleImageElement(clone));
      } catch {
        resolve(null);
      }
    };
    clone.onerror = () => resolve(null);
    clone.src = src;
    setTimeout(() => resolve(null), 1800);
  });
}

function applyColor(card: HTMLElement, rgb: RGB) {
  card.style.setProperty("--cover-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  card.classList.add("cover-tinted");
}

async function sampleByFetch(src: string): Promise<RGB | null> {
  try {
    const resp = await fetch(src, { mode: 'cors' }).catch(() => null);
    if (!resp || !resp.ok) return null;
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const rgb = sampleImageElement(img);
        URL.revokeObjectURL(url);
        resolve(rgb);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch (e) {
    return null;
  }
}

async function processCard(card: HTMLElement) {
  const img = card.querySelector<HTMLImageElement>(IMAGE_SELECTOR);
  if (!img) return;

  const src = img.currentSrc || img.src || img.getAttribute("src") || "";
  if (!src) return;

  if (card.dataset.liquidGlassSrc === src) return;
  card.dataset.liquidGlassSrc = src;

  // 优先从缓存取色
  const cachedColor = colorCache.get(src);
  if (cachedColor) {
    applyColor(card, cachedColor);
    return;
  }

  // 初始兜底色（哈希生成，极快）
  const fallback = hashColor(src || card.innerText);
  applyColor(card, fallback);

  // 异步采样：不对主线程产生阻塞
  void (async () => {
    try {
      await waitForImage(img);

      // 尝试直接取色 (Fastest)
      let sampled: RGB | null = null;
      try {
        sampled = sampleImageElement(img);
      } catch { /* ignore */ }

      // 克隆取色 (Standard)
      if (!sampled) {
        try {
          sampled = await sampleByClonedImage(src);
        } catch { /* ignore */ }
      }

      // Fetch 取色 (Bypass CORS)
      if (!sampled) {
        try {
          sampled = await sampleByFetch(src);
        } catch { /* ignore */ }
      }

      const finalColor = sampled || hashColor(src || card.innerText);
      colorCache.set(src, finalColor);
      // 仅在卡片仍是此 src 时更新（防止快速滚动时错乱）
      if (card.dataset.liquidGlassSrc === src) {
        applyColor(card, finalColor);
      }
    } catch {
      // 静默失败，保持 fallback 颜色
    }
  })();
}

/**
 * 使用 IntersectionObserver 懒加载处理卡片，避免 `getBoundingClientRect` 导致强制回流卡顿。
 */
export default function LiquidGlassRuntime() {
  const processedRef = useRef(new WeakSet<HTMLElement>());

  useEffect(() => {
    // 处理进入视口的卡片
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const card = entry.target as HTMLElement;
            void processCard(card);
            // 这里我们不在此处 unobserve，因为图片可能会更新
          }
        }
      },
      {
        rootMargin: "300px", // 提前 300px 预加载取色
      }
    );

    // 监听 DOM 树变化以发现新插入的卡片
    const domObserver = new MutationObserver((mutations) => {
      if (document.documentElement.classList.contains("view-transitioning")) return;
      
      let hasNewCards = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewCards = true;
          break;
        }
      }

      if (hasNewCards) {
        // 采用节流的方式绑定新的 Observer
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(observeCards, { timeout: 1000 });
        } else {
          setTimeout(observeCards, 500);
        }
      }
    });

    const observeCards = () => {
      const cards = document.querySelectorAll<HTMLElement>(CARD_SELECTOR);
      for (const card of cards) {
        if (!processedRef.current.has(card)) {
          processedRef.current.add(card);
          observer.observe(card);
        }
      }
    };

    // 首次启动
    observeCards();

    // 观察整个文档的 DOM 插入，以捕获路由变化或无限滚动带来的新卡片
    const mainEl = document.querySelector(".main");
    domObserver.observe(mainEl || document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      domObserver.disconnect();
    };
  }, []);

  return null;
}
