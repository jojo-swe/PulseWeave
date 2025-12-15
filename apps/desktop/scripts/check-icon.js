const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../resources/icon.png');
const buffer = fs.readFileSync(file);

console.log('First 8 bytes:', buffer.subarray(0, 8).toString('hex'));

if (buffer.subarray(0, 8).toString('hex').toUpperCase() === '89504E470D0A1A0A') {
    console.log('It is a valid PNG header.');
} else {
    console.log('NOT a PNG header.');
    // Check for WebP: RIFF ... WEBP
    if (buffer.subarray(0, 4).toString('hex') === '52494646' && buffer.subarray(8, 12).toString('hex') === '57454250') {
        console.log('It is a WebP file.');
    }
}
