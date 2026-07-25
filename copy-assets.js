import fs from 'fs';
import path from 'path';
import https from 'https';

const tesseractDir = path.join('public', 'tesseract');

// Ensure directory exists
if (!fs.existsSync(tesseractDir)) {
  fs.mkdirSync(tesseractDir, { recursive: true });
}

// Copy worker.min.js
fs.copyFileSync(
  path.join('node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
  path.join(tesseractDir, 'worker.min.js')
);
console.log('Copied worker.min.js');

// Copy tesseract-core.wasm.js
fs.copyFileSync(
  path.join('node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js'),
  path.join(tesseractDir, 'tesseract-core.wasm.js')
);
console.log('Copied tesseract-core.wasm.js');

// Copy tesseract-core.wasm
fs.copyFileSync(
  path.join('node_modules', 'tesseract.js-core', 'tesseract-core.wasm'),
  path.join(tesseractDir, 'tesseract-core.wasm')
);
console.log('Copied tesseract-core.wasm');

// Download eng.traineddata.gz
const dest = path.join(tesseractDir, 'eng.traineddata.gz');
const url = 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz';

console.log('Downloading eng.traineddata.gz...');
const file = fs.createWriteStream(dest);

https.get(url, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect if any
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
    });
  } else {
    response.pipe(file);
  }
  
  file.on('finish', () => {
    file.close();
    console.log('Downloaded eng.traineddata.gz successfully!');
  });
}).on('error', (err) => {
  fs.unlink(dest, () => {});
  console.error('Error downloading eng.traineddata.gz:', err.message);
});
