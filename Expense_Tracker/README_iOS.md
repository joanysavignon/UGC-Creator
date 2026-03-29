# Expense Tracker - iOS PWA Version

This is a Progressive Web App (PWA) version of the Expense Tracker that can be installed on iOS devices and run from the Files app or home screen.

## Features

- ✅ Full offline functionality
- ✅ Installable on iOS home screen
- ✅ Works from Files app
- ✅ Responsive mobile design
- ✅ Hamburger menu navigation
- ✅ Touch-optimized interface

## iOS Installation Instructions

### Method 1: Install from Safari (Recommended)

1. **Open in Safari**: Open this folder in your iPhone's Files app, then tap on `index.html` to open in Safari
2. **Add to Home Screen**:
   - Tap the share button (square with arrow)
   - Scroll down and tap "Add to Home Screen"
   - Name it "Expense Tracker" and tap "Add"
3. **Launch**: The app icon will appear on your home screen

### Method 2: Run from Files App

1. **Open Files App**: Navigate to this folder
2. **Tap index.html**: This will open the app in Safari
3. **Use as Web App**: The app will work with full functionality

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

## Offline Functionality

The app includes a service worker that caches all necessary files, allowing it to work offline. Your expense data is stored locally in your browser's storage.

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
- The app uses localStorage, which should work offline
- Make sure you have enough storage space

**Icons not showing?**
- Run the icon generator and download the PNG files
- Make sure they're named exactly `icon-192.png` and `icon-512.png`

## Development

To modify the app:
1. Edit the HTML, CSS, and JavaScript files
2. Test in Safari on iOS
3. Update the service worker version in `sw.js` if you change cached files

## Privacy

- All data stays on your device
- No internet connection required for core functionality
- No data is sent to external servers