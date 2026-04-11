const JSZip = require('jszip');
const fs = require('fs');

async function main() {
  const buf = fs.readFileSync('viva-la-vida-andy-morris-a6a81fecb01e55b217a9193d66e295b6d78293ef.mxl');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('score.xml').async('string');
  
  // Find first rest in bass clef (staff 2) and first beamed notes
  const lines = xml.split('\n');
  
  // Find <rest/> elements with context
  let inStaff2 = false;
  let foundRest = 0;
  let foundBeam = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('<staff>2</staff>')) inStaff2 = true;
    if (line.includes('<staff>1</staff>')) inStaff2 = false;
    
    if (inStaff2 && line.includes('<rest') && foundRest < 2) {
      console.log('=== REST in staff 2 (line ' + i + ') ===');
      console.log(lines.slice(Math.max(0, i-5), i+10).join('\n'));
      console.log('');
      foundRest++;
    }
    
    if (line.includes('<beam') && foundBeam < 2) {
      console.log('=== BEAM (line ' + i + ') ===');
      console.log(lines.slice(Math.max(0, i-3), i+5).join('\n'));
      console.log('');
      foundBeam++;
    }
    
    if (foundRest >= 2 && foundBeam >= 2) break;
  }
}
main();
