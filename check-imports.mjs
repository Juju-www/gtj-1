// Statische Prüfung aller Client-Importe: Zieldatei vorhanden + benannte Exporte existieren.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'); let errors = 0;
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []); }
for (const f of [...walk(path.join(root, 'client/src')), ...walk(path.join(root, 'server/src')), ...walk(path.join(root, 'shared'))]) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:\{([^}]*)\}|\*\s+as\s+\w+|(\w+))\s+from\s+'([^']+)'/g)) {
    const spec = m[3]; if (!spec.startsWith('.')) { if (spec !== 'three' && !spec.startsWith('three/') && !['express', 'socket.io'].includes(spec) && !spec.startsWith('node:')) { console.log('?? Paket', spec, 'in', path.relative(root, f)); } continue; }
    const target = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(target)) { console.log('FEHLT:', spec, 'in', path.relative(root, f)); errors++; continue; }
    if (m[1]) { const ts = fs.readFileSync(target, 'utf8'); for (const n of m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (!new RegExp(`export\\s+(?:async\\s+)?(?:const|let|class|function|var)\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b`).test(ts)) { console.log('Export fehlt:', n, 'in', spec, '(von', path.relative(root, f) + ')'); errors++; } }
  }
}
console.log(errors ? errors + ' Fehler' : 'Alle Importe konsistent'); process.exit(errors ? 1 : 0);
