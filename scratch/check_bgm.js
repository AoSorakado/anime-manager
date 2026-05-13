async function check() {
  try {
    const url = `https://api.bgm.tv/v0/subjects?type=2&sort=date&year=2026&month=4&limit=100&offset=0`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "local-anime-library/0.1.0",
        Accept: "application/json",
      },
    });
    const json = await response.json();
    const target = json.data.find(i => String(i.id) === '590353');
    console.log('List API result for 婚姻剧毒:', JSON.stringify(target, null, 2));
  } catch (e) {
    console.error(e);
  }
}

check();
