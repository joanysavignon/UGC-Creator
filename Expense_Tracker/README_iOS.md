# Expense Tracker - Local + GitHub Pages

This project supports two modes:

- Local server mode with a JSON file via `python server.py`
- Static hosting mode, including GitHub Pages, using browser storage

## Features

- ✅ JSON-file local server mode
- ✅ GitHub Pages compatible static mode
- ✅ Local JSON export/import per page
- ✅ Installable on iOS home screen
- ✅ Works from a local server in desktop browsers
- ✅ Responsive mobile design
- ✅ Hamburger menu navigation
- ✅ Touch-optimized interface

## Run the app

1. Open a terminal in this folder
2. Run `python server.py`
3. Open `http://127.0.0.1:8000/index.html`

The JSON data file is stored in `expense_data_store.json` in the project folder.

## GitHub Pages

You can deploy the same files to GitHub Pages as a static site.

- On GitHub Pages, the app uses browser storage instead of the local JSON file
- Each browser/device keeps its own data
- JSON export/import still works
- The PWA paths are configured to work from a repository subfolder

## iOS Installation Instructions

### Method 1: Install from Safari (Recommended)

1. **Start the local server** on the machine hosting the files with `python server.py`
2. **Open the served URL in Safari**. If you want to install from another device, use the host machine's local network IP instead of `127.0.0.1`
2. **Add to Home Screen**:
   - Tap the share button (square with arrow)
   - Scroll down and tap "Add to Home Screen"
   - Name it "Expense Tracker" and tap "Add"
3. **Launch**: The app icon will appear on your home screen

### Method 2: Run from Files App

Opening `index.html` directly still loads the UI, but JSON-file storage requires running through `python server.py`. On GitHub Pages or direct-file usage, the app uses browser local storage instead.

## Creating App Icons

1. Open `icon_generator.html` in your browser
2. Click "Download 192x192 Icon" to get `icon-192.png`
3. Click "Download 512x512 Icon" to get `icon-512.png`
4. Place these files in the same folder as the other files

## File Structure

```
expense_tracker/
├── index.html              # Main expense tracker
├── creditcards.html        # Credit cards page
├── creditcard_expenses.html # CC expenses page
├── savings.html            # Savings tracker
├── style.css               # Styles with mobile optimizations
├── script.js               # JavaScript with PWA features
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker for offline
├── icon_generator.html     # Tool to create app icons
└── icon.svg                # SVG version of icon
```

## Data Storage

- Local server mode stores data in `expense_data_store.json`
- GitHub Pages stores data in browser local storage
- JSON export/import still works for each page
- Optional `data_backup` folder saves are still available in supported browsers

## Browser Compatibility

- ✅ Safari (iOS 11.3+)
- ✅ Chrome (iOS)
- ✅ Firefox (iOS)
- ✅ Edge (iOS)

## Troubleshooting

**App won't install?**
- Make sure you're using Safari
- Check that manifest.json and icons are in the same folder
- Try refreshing the page and trying again

**Data not saving?**
- Make sure the app is opened through `http://127.0.0.1:8000` or your machine's LAN URL
- Confirm `python server.py` is still running
- On GitHub Pages, data is expected to save in browser local storage rather than the local JSON file

**Icons not showing?**
- Run the icon generator and download the PNG files
- Make sure they're named exactly `icon-192.png` and `icon-512.png`

## Development

To modify the app:
1. Edit the HTML, CSS, JavaScript, or `server.py`
2. Run `python server.py`
3. Test in a browser
4. Update the service worker version in `sw.js` if you change cached files

## Privacy

- All data stays on your device unless you choose to serve it across your local network
- No internet connection is required for core tracking after the page is loaded
- No data is sent to external servers
