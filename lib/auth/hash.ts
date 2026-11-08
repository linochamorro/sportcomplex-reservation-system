import bcryptjs from 'bcryptjs';

const COSTE = 12;
const HASH_SENUELO = '$2b$12$d.9EkUh3IG6fHaqksHfu6.hvFyInCA7Yq28XwfoWYUbxOgVVqG9hq';

export async function hachearClave(clave: string): Promise<string> {
  return bcryptjs.hash(clave, COSTE);
}

export async function verificarClave(clave: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(clave, hash);
}

export async function trabajoDeClaveSenuelo(): Promise<void> {
  await bcryptjs.compare('trabajo-senuelo-anti-enumeracion', HASH_SENUELO);
}
