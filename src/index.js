const { app, BrowserWindow } = require("electron");
const path = require("path");

let mainWindow;
async function init() {
    if (mainWindow) return;
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
            contextIsolation: false
        }
    });
    
    if (~process.argv.indexOf("--dev"))
        await mainWindow.loadURL("http://localhost:3000");
    else
        await mainWindow.loadFile(path.join(__dirname, "frontend/index.html"));
}

app.disableHardwareAcceleration();
app.whenReady().then(init);
app.on("window-all-closed", app.exit.bind(app, 1));