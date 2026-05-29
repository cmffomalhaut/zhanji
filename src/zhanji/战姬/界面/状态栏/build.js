// build.js — 将 styles.css + script.js 内联到 zhanji.yaml 用于部署
const fs = require('fs');
const path = require('path');

const dir = __dirname;

let yaml = fs.readFileSync(path.join(dir, 'zhanji.yaml'), 'utf8');
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'script.js'), 'utf8');

const cssLines = css.split('\n').map(l => '    ' + l).join('\n');
const jsLines = js.split('\n').map(l => '    ' + l).join('\n');

// 用函数回调替代字符串替换——避免 $ 重复解析
yaml = yaml.replace(
  /  <link rel="stylesheet" href="styles\.css">/,
  () => '  <style>\n' + cssLines + '\n  </style>'
);

yaml = yaml.replace(
  /  <script type="module" src="script\.js"><\/script>/,
  () => '  <script type="module">\n' + jsLines + '\n  </script>'
);

fs.writeFileSync(path.join(dir, 'zhanji.yaml'), yaml);
console.log('Built: ' + yaml.length + ' bytes, ' + yaml.split('\n').length + ' lines');
console.log('Ready → copy zhanji.yaml to SillyTavern.');
