const fs = require('fs');
const path = require('path');
// const sharp = require('sharp'); // Skip sharp now as it's fixed
const pngToIcoModule = require('png-to-ico');

const pngToIco = pngToIcoModule.default || pngToIcoModule;

const inputPath = path.join(__dirname, '../resources/icon.png');
const icoPath = path.join(__dirname, '../resources/icon.ico');

async function convert() {
  console.log('Generating icon.ico...');
  const buffer = fs.readFileSync(inputPath);
  
  if (typeof pngToIco !== 'function') {
      console.error('pngToIco is not a function:', pngToIco);
      throw new Error('pngToIco import failed');
  }
  
  const icoBuffer = await pngToIco(buffer);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Successfully generated icon.ico');
}

convert().catch(err => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
