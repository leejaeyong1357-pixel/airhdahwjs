// 화면(renderer)이 쓸 수 있는 기능만 골라서 넘겨준다
const { contextBridge, ipcRenderer, webUtils } = require("electron");
const call = (ch) => (arg) => ipcRenderer.invoke(ch, arg);
contextBridge.exposeInMainWorld("buddy", {
  getSettings: call("settings:get"), saveSettings: call("settings:save"), testHchat: call("hchat:test"),
  pickPhoto: call("photo:pick"), clearPhoto: call("photo:clear"),
  send: call("chat:send"), listEvents: call("schedule:list"), removeEvent: call("schedule:remove"),
  inspect: call("file:inspect"), convert: call("file:convert"), save: call("file:save"),
  pathOf: (f) => webUtils.getPathForFile(f),
  shape: (rects) => ipcRenderer.send("win:shape", rects),
  move: (dx, dy) => ipcRenderer.send("win:move", { dx, dy }),
  hide: () => ipcRenderer.send("win:hide"), quit: () => ipcRenderer.send("app:quit"),
  on: (ch, fn) => { if (["alarm", "progress", "ui"].includes(ch)) ipcRenderer.on(ch, (_e, v) => fn(v)); },
});
