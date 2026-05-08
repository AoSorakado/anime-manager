async function testTags() {
  const response = await fetch("https://bgm.tv/anime/tag", {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const html = await response.text();
  const tags = [];
  const regex = /<a href="\/anime\/tag\/[^"]+"[^>]*>([^<]+)<\/a>\s*<small class="grey">\(([^)]+)\)<\/small>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].trim();
    const count = parseInt(match[2].replace(/,/g, ""), 10);
    if (name && !isNaN(count)) {
      tags.push({ name, count });
    }
  }
  console.log("Found tags:", tags.length);
  console.log("Top 5:", tags.slice(0, 5));
}

testTags();
