const { app, BrowserWindow, session, dialog } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0a0a0f', // matches the app's dark theme — avoids a white flash on load
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Web Serial permission wiring — the app talks to the radio entirely through
  // navigator.serial (see src/radios/*/protocol.ts), unchanged from the browser version.
  // Electron implements the same Web Serial API but, unlike Chrome, has no built-in
  // port-picker UI — the app is responsible for resolving each select-serial-port request.
  const ses = session.defaultSession;

  ses.setPermissionCheckHandler((_webContents, permission) => permission === 'serial');

  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();

    if (portList.length === 0) {
      callback('');
      return;
    }
    if (portList.length === 1) {
      callback(portList[0].portId);
      return;
    }

    const labels = portList.map((p, i) => `${i + 1}. ${p.displayName || p.portName || p.portId}`);
    const choice = dialog.showMessageBoxSync({
      type: 'question',
      title: 'Select serial port',
      message: 'Multiple serial ports found — choose the radio/hotspot port:',
      buttons: [...labels, 'Cancel'],
      cancelId: labels.length,
      noLink: true,
    });
    callback(choice < labels.length ? portList[choice].portId : '');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
