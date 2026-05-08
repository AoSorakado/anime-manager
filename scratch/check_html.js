async function check() {
  const response = await fetch("https://bgm.tv/anime/tag", {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const text = await response.text();
  console.log(text.substring(text.indexOf("TV"), text.indexOf("TV") + 500));
}
check();
