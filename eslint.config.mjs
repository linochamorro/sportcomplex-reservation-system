import next from 'eslint-config-next';

const configuracion = [
  { ignores: ['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'node_modules/**', 'src/lib/db/generated/**', 'temporary/**'] },
  ...next,
];

export default configuracion;
