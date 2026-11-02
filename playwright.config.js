const path = require('path');
const { pathToFileURL } = require('url');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    acceptDownloads: true,
    // the app is a single file: no web server needed
    baseURL: pathToFileURL(path.resolve(__dirname, 'index.html')).href,
  },
  projects: [{
    name: 'chromium',
    use: {
      browserName: 'chromium',
      // optional: use a preinstalled Chromium (no effect when PW_CHROMIUM is unset)
      ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
    },
  }],
});
