// scripts/update_version.js
// assets/js/version.js の RECRUIT_APP_VERSION を読み取り、HTML内の ?v= を一括更新する。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const versionFile = path.join(root, 'assets', 'js', 'version.js');
const versionSource = fs.readFileSync(versionFile, 'utf8');
const match = versionSource.match(/RECRUIT_APP_VERSION\s*=\s*["']([^"']+)["']/);
if (!match) {
  throw new Error('RECRUIT_APP_VERSION が assets/js/version.js から取得できません。');
}
const version = match[1];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (['.git', 'node_modules'].includes(name)) continue;
      walk(full, out);
    } else if (full.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

for (const file of walk(root)) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/\?v=[A-Za-z0-9_-]+/g, `?v=${version}`);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log(`updated ${path.relative(root, file)}`);
  }
}
