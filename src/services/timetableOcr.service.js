const { createWorker } = require('tesseract.js');

async function ocrBuffer(buffer) {
  const worker = createWorker({
    logger: () => {},
  });
  await worker.load();
  await worker.loadLanguage('por+eng');
  await worker.initialize('por+eng');
  const { data } = await worker.recognize(buffer);
  await worker.terminate();
  return data?.text || '';
}

module.exports = { ocrBuffer };
