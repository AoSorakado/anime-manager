import { contextBridge, ipcRenderer } from "electron";
const api = {
    sources: {
        list: () => ipcRenderer.invoke("sources:list"),
        addLocal: (name) => ipcRenderer.invoke("sources:addLocal", name),
        addLocalPath: (rootPath, name) => ipcRenderer.invoke("sources:addLocalPath", rootPath, name),
        addWebDav: (input) => ipcRenderer.invoke("sources:addWebDav", input),
        rename: (id, name) => ipcRenderer.invoke("sources:rename", id, name),
        delete: (id) => ipcRenderer.invoke("sources:delete", id),
        scan: (sourceId) => ipcRenderer.invoke("sources:scan", sourceId)
    },
    media: {
        list: (args) => ipcRenderer.invoke("media:list", args),
        get: (id) => ipcRenderer.invoke("media:get", id),
        issues: (limit) => ipcRenderer.invoke("media:issues", limit),
        watchStats: () => ipcRenderer.invoke("media:watchStats"),
        setStatus: (id, status) => ipcRenderer.invoke("media:setStatus", id, status),
        openFolder: (folderPath) => ipcRenderer.invoke("media:openFolder", folderPath),
        recleanNames: () => ipcRenderer.invoke("media:recleanNames")
    },
    files: {
        play: (fileId) => ipcRenderer.invoke("files:play", fileId),
        setWatched: (fileId, watched) => ipcRenderer.invoke("files:setWatched", fileId, watched),
        setStatus: (fileId, status) => ipcRenderer.invoke("files:setStatus", fileId, status)
    },
    scraper: {
        searchBangumi: (mediaItemId, keyword) => ipcRenderer.invoke("scraper:searchBangumi", mediaItemId, keyword),
        applyBangumi: (mediaItemId, externalId) => ipcRenderer.invoke("scraper:applyBangumi", mediaItemId, externalId),
        getBangumiSubject: (subjectId) => ipcRenderer.invoke("scraper:getBangumiSubject", subjectId),
        getPerson: (personId) => ipcRenderer.invoke("scraper:getPerson", personId),
        refreshBangumiById: (mediaItemId) => ipcRenderer.invoke("scraper:refreshBangumiById", mediaItemId),
        batchRefreshBangumiById: (options) => ipcRenderer.invoke("scraper:batchRefreshBangumiById", options),
        getBangumiCalendar: () => ipcRenderer.invoke("scraper:getBangumiCalendar")
    },
    bangumi: {
        testToken: (token) => ipcRenderer.invoke("bangumi:testToken", token),
        syncLocalStatus: () => ipcRenderer.invoke("bangumi:syncLocalStatus"),
        listCollections: () => ipcRenderer.invoke("bangumi:listCollections"),
        serviceStatus: () => ipcRenderer.invoke("bangumi:serviceStatus"),
    },
    logs: {
        list: (limit) => ipcRenderer.invoke("logs:list", limit)
    },
    settings: {
        get: () => ipcRenderer.invoke("settings:get"),
        set: (key, value) => ipcRenderer.invoke("settings:set", key, value),
        chooseMpv: () => ipcRenderer.invoke("settings:chooseMpv")
    },
    sync: {
        uploadWebDav: () => ipcRenderer.invoke("sync:uploadWebDav"),
        downloadWebDav: () => ipcRenderer.invoke("sync:downloadWebDav")
    },
    subscriptions: {
        list: () => ipcRenderer.invoke("subscriptions:list"),
        items: (subscriptionId) => ipcRenderer.invoke("subscriptions:items", subscriptionId),
        add: (input) => ipcRenderer.invoke("subscriptions:add", input),
        delete: (id) => ipcRenderer.invoke("subscriptions:delete", id),
        searchMikan: (keyword) => ipcRenderer.invoke("subscriptions:searchMikan", keyword),
        getMikanBangumi: (bangumiId) => ipcRenderer.invoke("subscriptions:getMikanBangumi", bangumiId),
        refresh: (id) => ipcRenderer.invoke("subscriptions:refresh", id),
        refreshAll: () => ipcRenderer.invoke("subscriptions:refreshAll"),
        sendItem: (itemId) => ipcRenderer.invoke("subscriptions:sendItem", itemId),
        sendUrl: (url, savePath, title) => ipcRenderer.invoke("subscriptions:sendUrl", url, savePath, title),
        sendPending: (subscriptionId) => ipcRenderer.invoke("subscriptions:sendPending", subscriptionId),
        testQbittorrent: () => ipcRenderer.invoke("subscriptions:testQbittorrent")
    },
    cloudOffline: {
        list123: () => ipcRenderer.invoke("cloudOffline:list123"),
        submit123: (input) => ipcRenderer.invoke("cloudOffline:submit123", input),
        refresh123: (taskId) => ipcRenderer.invoke("cloudOffline:refresh123", taskId),
        refreshAll123: () => ipcRenderer.invoke("cloudOffline:refreshAll123"),
        listPikpak: () => ipcRenderer.invoke("cloudOffline:listPikpak"),
        submitPikpak: (input) => ipcRenderer.invoke("cloudOffline:submitPikpak", input),
        refreshPikpak: () => ipcRenderer.invoke("cloudOffline:refreshPikpak")
    },
    season: {
        getAnime: (year, season, options) => ipcRenderer.invoke("season:getAnime", year, season, options),
        getDetail: (bangumiId) => ipcRenderer.invoke("season:getDetail", bangumiId),
        getMikanResources: (keyword) => ipcRenderer.invoke("season:getMikanResources", keyword),
    },
    online: {
        listRules: () => ipcRenderer.invoke("online:listRules"),
        search: (input) => ipcRenderer.invoke("online:search", input),
        episodes: (input) => ipcRenderer.invoke("online:episodes", input),
        playUrl: (url, title, referer, ruleInput, bangumiId) => ipcRenderer.invoke("online:playUrl", url, title, referer, ruleInput, bangumiId)
    },
    window: {
        minimize: () => ipcRenderer.invoke("window:minimize"),
        maximize: () => ipcRenderer.invoke("window:maximize"),
        close: () => ipcRenderer.invoke("window:close")
    }
};
contextBridge.exposeInMainWorld("libraryApi", api);
