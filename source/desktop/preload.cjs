// Exposes a tiny read-only flag so the game can tell it runs inside the desktop shell. No privileged APIs.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('__fableDesktop', { version: process.versions.electron, platform: process.platform });
