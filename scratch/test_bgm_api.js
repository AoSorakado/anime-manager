async function testSearch() {
  const tagName = "TV";
  const response = await fetch("https://api.bgm.tv/v0/search/subjects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "local-anime-library/0.1.0"
    },
    body: JSON.stringify({
      keyword: tagName,
      sort: "rank",
      filter: {
        type: [2],
        tag: [tagName]
      }
    })
  });
  console.log("Status:", response.status);
  const json = await response.json();
  console.log("Total:", json.total);
  console.log("Data length:", json.data?.length);
  if (json.data?.length > 0) {
    console.log("First item:", json.data[0].name);
  }
}

testSearch();
