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
  const targetS = Math.min(0.78, Math.max(0.35, s * 1.22 + 0.08));
  // 亮度：暗色提亮、亮色微压，锁定玻璃 UI 最佳可读区间
  const targetL = Math.min(0.62, Math.max(0.40, l * 0.55 + 0.22));
  
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
 * 使用 requestIdleCallback 逐个处理卡片，避免阻塞主线程。
 * 增加视口感知：只处理可见或即将进入视口的卡片。
 */
function scanCardsIdle() {
  if (document.documentElement.classList.contains("view-transitioning")) return;

  const cards = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  if (cards.length === 0) return;

  // 优先处理视口内卡片
  const inView: HTMLElement[] = [];
  const outOfView: HTMLElement[] = [];
  const margin = 300; // 预加载范围

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (
      rect.bottom >= -margin &&
      rect.top <= window.innerHeight + margin &&
      rect.right >= -margin &&
      rect.left <= window.innerWidth + margin
    ) {
      inView.push(card);
    } else {
      outOfView.push(card);
    }
  }

  const queue = [...inView, ...outOfView];

  function processNext() {
    if (queue.length === 0) return;
    const card = queue.shift()!;
    void processCard(card);

    if (queue.length > 0) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(processNext, { timeout: 100 });
      } else {
        setTimeout(processNext, 16);
      }
    }
  }

  processNext();
}

export default function LiquidGlassRuntime() {
  const lastScanRef = useRef(0);

  useEffect(() => {
    let idleId: number;

    const scheduleScan = () => {
      // 节流：最小间隔 800ms，避免高频触发
      const now = Date.now();
      if (now - lastScanRef.current < 800) return;
      lastScanRef.current = now;

      if (typeof requestIdleCallback === "function") {
        cancelIdleCallback(idleId);
        idleId = requestIdleCallback(() => scanCardsIdle(), { timeout: 500 });
      } else {
        setTimeout(() => scanCardsIdle(), 150);
      }
    };

    // 首次扫描
    scheduleScan();

    // 定时轮询（低频，仅兜底）
    const timer = setInterval(scheduleScan, 4000);

    // MutationObserver：仅观察 .main 容器，大幅减少回调
    const mainEl = document.querySelector(".main");
    const observer = new MutationObserver(() => {
      if (!document.documentElement.classList.contains("view-transitioning")) {
        scheduleScan();
      }
    });

    if (mainEl) {
      observer.observe(mainEl, { childList: true, subtree: true });
    } else {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      clearInterval(timer);
      observer.disconnect();
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleId);
      }
    };
  }, []);

  return null;
}
