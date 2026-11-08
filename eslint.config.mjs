import next from 'eslint-config-next';

const configuracion = [
  { ignores: ['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'node_modules/**', 'lib/db/generated/**'] },
  ...next,
];

export default configuracion;
