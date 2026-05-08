
import { app, BrowserWindow } from 'electron';

async function testXPath() {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  
  const html = `
    <div class="item">
      <h3><a href="/anime/1">Anime 1</a></h3>
      <img src="cover1.jpg">
    </div>
    <div class="item">
      <h3><a href="/anime/2">Anime 2</a></h3>
      <img src="cover2.jpg">
    </div>
  `;
  
  const xpath = "//div[@class='item']";
  
  // Use a data URL to load the HTML
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  const results = await win.webContents.executeJavaScript(`
    (function() {
      const results = [];
      const nodes = document.evaluate("${xpath}", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < nodes.snapshotLength; i++) {
        results.push(nodes.snapshotItem(i).outerHTML);
      }
      return results;
    })()
  `);
  
  console.log('Results:', results);
  app.quit();
}

testXPath();
