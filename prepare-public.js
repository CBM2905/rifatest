const fs = require('fs');
const path = require('path');

const srcFiles = ['index.html', 'styles.css', 'app.js', 'config.js', 'firestore.rules', 'README.md'];
const outDir = path.join(__dirname, 'public');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

srcFiles.forEach(f => {
  const src = path.join(__dirname, f);
  const dest = path.join(outDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('copied', f);
  }
});

// copy assets folder if exists
const assetsSrc = path.join(__dirname, 'assets');
const assetsDest = path.join(outDir, 'assets');
if (fs.existsSync(assetsSrc)) {
  fs.mkdirSync(assetsDest, { recursive: true });
  fs.readdirSync(assetsSrc).forEach(file => {
    fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDest, file));
  });
}

console.log('prepare-public: public folder prepared.');
