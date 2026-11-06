// Renders page 1 of a PDF to PNG with pdf.js inside headless Chrome.
// Usage: node pdf2png.js in.pdf out.png [scale]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [inPdf, outPng, scale = '2.5'] = process.argv.slice(2);
const lib = (f) => fs.readFileSync(path.join(__dirname, 'node_modules/pdfjs-dist/build', f), 'utf8');
const b64 = fs.readFileSync(inPdf).toString('base64');
const html = `<!doctype html><html><body style="margin:0;background:#fff"><canvas id="c"></canvas>
<script>${lib('pdf.min.js')}</script>
<script id="w" type="text/js-worker">${lib('pdf.worker.min.js').replace(/<\/script/g, '<\\/script')}</script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([document.getElementById('w').textContent], { type: 'text/javascript' }));
const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
pdfjsLib.getDocument({ data: bytes }).promise.then((pdf) => pdf.getPage(1)).then((page) => {
  const vp = page.getViewport({ scale: ${scale} });
  const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height;
  document.title = vp.width + 'x' + vp.height;
  return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(() => {
    document.body.innerHTML = '<img src="' + c.toDataURL('image/png') + '" style="display:block">';
  });
});
</script></body></html>`;
const tmp = path.join(__dirname, '_pdf2png.html');
fs.writeFileSync(tmp, html);
// first pass: learn the page size
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dump = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--virtual-time-budget=15000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')], { maxBuffer: 1 << 28 }).toString();
const m = dump.match(/<title>(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)<\/title>/);
if (!m) throw new Error('render failed');
const [w, h] = [Math.ceil(+m[1]), Math.ceil(+m[2])];
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=15000', `--window-size=${w},${h}`, `--screenshot=${path.resolve(outPng)}`, 'file:///' + tmp.replace(/\\/g, '/')]);
fs.unlinkSync(tmp);
console.log(outPng, w + 'x' + h);
