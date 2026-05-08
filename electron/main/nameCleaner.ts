const noiseWords = [
  "4k",
  "60fps",
  "sdr",
  "hdr",
  "2160p",
  "1080p",
  "720p",
  "bdrip",
  "bdremux",
  "webrip",
  "web-dl",
  "hevc",
  "avc",
  "x264",
  "x265",
  "h.264",
  "h.265",
  "10bit",
  "8bit",
  "flac",
  "opus",
  "aac",
  "chs",
  "cht",
  "gb",
  "big5",
  "ova",
  "简繁",
  "简体",
  "繁体",
  "字幕",
  "字幕组"
];

const groupWords = ["raw", "raws", "sub", "subs", "lksub", "saio", "ani", "dbd-raws", "h-enc"];

const noisePatterns = [
  /^[A-Z]\s+(?:4k\s+)?/i,
  /\b(4k|60fps|sdr|hdr|2160p|1080p|720p|bdrip|bdremux|webrip|web-dl|hevc|avc|x264|x265|h\.264|h\.265|10bit|8bit|flac|opus|aac|chs|cht|gb|big5)\b/gi,
  /(简繁|简体|繁体|合集|全集|内封|字幕|字幕组)/g,
  /\b\d{1,3}\s*-\s*\d{1,3}\b/g
];

export function cleanFolderName(folderName: string) {
  let clean = preserveTitleBrackets(folderName);
  for (const pattern of noisePatterns) {
    clean = clean.replace(pattern, " ");
  }
  clean = clean
    .replace(/\[[^\]]*\]/g, (token) => bracketContent(token))
    .replace(/\([^\)]*\)/g, (token) => bracketContent(token))
    .replace(/[._]+/g, " ")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean || folderName.trim();
}

function preserveTitleBrackets(value: string) {
  return value.replace(/\[([^\]]+)\]/g, (token, content: string) => {
    if (isNoiseToken(content)) return " ";
    return ` ${content} `;
  });
}

function bracketContent(token: string) {
  const content = token.slice(1, -1).trim();
  return isNoiseToken(content) ? " " : ` ${content} `;
}

function isNoiseToken(value: string) {
  const lower = value.toLowerCase();
  if (/^\d{1,3}\s*-\s*\d{1,3}$/.test(lower)) return true;
  if (/\d{1,3}\s*-\s*\d{1,3}/.test(lower)) return true;
  if (/^\d{1,3}$/.test(lower)) return true;
  if (lower.includes("全集") || lower.includes("合集")) return true;
  if (groupWords.some((word) => lower.includes(word))) return true;
  if (noiseWords.some((word) => lower.includes(word))) return true;
  if (/^\d{3,4}x\d{3,4}$/.test(lower)) return true;
  return false;
}

export function simpleMatchScore(query: string, title: string) {
  const a = normalize(query);
  const b = normalize(title);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 86;
  const chars = new Set(a.split(""));
  const overlap = b.split("").filter((char) => chars.has(char)).length;
  return Math.round((overlap / Math.max(a.length, b.length)) * 70);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s._:：\-!！?？'"]/g, "");
}
