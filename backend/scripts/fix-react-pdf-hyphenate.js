// @react-pdf/hyphenate publica su package.json con "type":"module" y un
// exports map que solo declara la condición "import" -- bajo Node
// nodenext/CJS (como corre este proyecto vía tsx/tsc), cualquier require()
// que llegue a un subpath (ej. "@react-pdf/hyphenate/en-us", que usa
// @react-pdf/renderer internamente) falla con
// ERR_PACKAGE_PATH_NOT_EXPORTED aunque Node 24 sí puede cargar el archivo
// ESM vía require(esm). Node 24 sí soporta requerir ESM síncronamente, el
// exports map solo necesita permitirlo -- así que se le agrega la condición
// "require" apuntando al mismo archivo .js. `npm install` reinstala esta
// dependencia con su package.json original, por eso este fix corre como
// postinstall en vez de quedar como una edición manual que se pierde.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', '@react-pdf', 'hyphenate', 'package.json');

if (!fs.existsSync(pkgPath)) {
  // @react-pdf/renderer no instalado (ej. entorno sin la dependencia) -- no hay nada que arreglar.
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let cambiado = false;
for (const key of Object.keys(pkg.exports ?? {})) {
  const entry = pkg.exports[key];
  if (entry && typeof entry === 'object' && entry.import && !entry.require) {
    entry.require = entry.import;
    cambiado = true;
  }
}

if (cambiado) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[postinstall] Parcheado @react-pdf/hyphenate para permitir require() (ver scripts/fix-react-pdf-hyphenate.js).');
}
