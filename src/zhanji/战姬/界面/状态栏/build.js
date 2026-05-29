// build.js — 将 styles.css + script.js 内联到 zhanji.yaml 用于部署
const fs = require('fs');
const path = require('path');

const dir = __dirname;

// Read source files
let yaml = fs.readFileSync(path.join(dir, 'zhanji.yaml'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

// Indent CSS
const cssLines = css.split('\n').map(l => '    ' + l).join('\n');

// Indent JS
const jsLines = js.split('\n').map(l => '    ' + l).join('\n');

// Replace <link> with inline <style>
yaml = yaml.replace(
  /  <link rel="stylesheet" href="styles\.css">/,
  '  <style>\n' + cssLines + '\n  </style>'
);

// Replace <script src> with inline <script>  
yaml = yaml.replace(
  /  <script type="module" src="script\.js"><\/script>/,
  '  <script type="module">\n' + jsLines + '\n  </script>'
);

// Write deployable output
fs.writeFileSync(path.join(dir, 'zhanji.yaml'), yaml);
console.log('Built: ' + yaml.length + ' bytes, ' + yaml.split('\n').length + ' lines');
console.log('Ready → copy zhanji.yaml to SillyTavern.');
