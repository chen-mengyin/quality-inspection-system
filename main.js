var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Menu = electron.Menu;
var shell = electron.shell;
var dialog = electron.dialog;
var ipcMain = electron.ipcMain;
var path = require('path');
var fs = require('fs');
var mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#f4f7fb',
    title: '质检云',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', function () {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:\/\//i.test(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', function (event, url) {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

ipcMain.handle('save-file', async function (event, payload) {
  var result = await dialog.showSaveDialog({
    title: '保存文件',
    defaultPath: payload.defaultName,
    filters: payload.filters || [{ name: '所有文件', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  var content = payload.encoding === 'base64'
    ? Buffer.from(payload.content, 'base64')
    : Buffer.from(payload.content, 'utf8');
  fs.writeFileSync(result.filePath, content);
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(createMainWindow);
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
