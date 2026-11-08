#!/usr/bin/env node
// Diagnostico de correo (SMTP) y de comprobantes (Supabase Storage).
// Uso: node scripts/probar-correo.mjs [destinatario]
// No envia nada salvo que se pase un destinatario; sin argumento solo reporta
// la configuracion y prueba la conexion SMTP con unEHLO.
import 'dotenv/config';
import nodemailer from 'nodemailer';

const faltantes = (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'FRONTEND_URL']).filter(
  (k) => !process.env[k] || process.env[k].length === 0,
);
const storage = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'].filter(
  (k) => !process.env[k] || process.env[k].length === 0,
);

console.log('--- Configuracion ---');
console.log(`SMTP_HOST      : ${process.env.SMTP_HOST ?? '(vacio)'}`);
console.log(`SMTP_PORT      : ${process.env.SMTP_PORT ?? '587 (por defecto)'}`);
console.log(`SMTP_SECURE    : ${process.env.SMTP_SECURE ?? '0'}`);
console.log(`SMTP_USER      : ${process.env.SMTP_USER ?? '(vacio)'}`);
console.log(`SMTP_PASS      : ${process.env.SMTP_PASS ? `definido (${process.env.SMTP_PASS.length} caracteres)` : '(vacio)'}`);
console.log(`SMTP_FROM      : ${process.env.SMTP_FROM ?? '(vacio)'}`);
console.log(`FRONTEND_URL   : ${process.env.FRONTEND_URL ?? '(vacio)'}`);
console.log(`CRON_SECRET    : ${process.env.CRON_SECRET ? 'definido' : '(vacio) — sin esto el mantenimiento responde 503'}`);
console.log(`Storage Supabase: ${storage.length === 0 ? 'completo' : `incompleto (faltan ${storage.join(', ')})`}`);
console.log(`Faltan para correo: ${faltantes.length === 0 ? 'ninguna' : faltantes.join(', ')}`);

if (faltantes.length > 0) {
  console.log('\nConclusion: el sistema NO puede enviar correos. Configura lo que falta en .env (local) y en Vercel > Settings > Environment Variables.');
} else {
  const puerto = Number(process.env.SMTP_PORT ?? 587);
  const seguro = process.env.SMTP_SECURE === '1' || puerto === 465;
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: puerto,
    secure: seguro,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  console.log('\n--- Conexion SMTP ---');
  try {
    await transporte.verify();
    console.log('Conexion OK: credenciales aceptadas.');
  } catch (error) {
    console.log(`FALLO: ${error.code ?? ''} ${error.message}`);
    if (error.code === 'EAUTH') {
      console.log('  -> Gmail exige verificacion en 2 pasos y una CONTRASENA DE APLICACION (16 caracteres), no la clave de la cuenta.');
    }
  }
  const destinatario = process.argv[2];
  if (destinatario) {
    try {
      await transporte.sendMail({
        from: process.env.SMTP_FROM,
        to: destinatario,
        subject: 'Prueba de correo - Sistema de reservas',
        text: 'Prueba enviada desde el diagnostico local.',
      });
      console.log(`Correo de prueba enviado a ${destinatario}.`);
    } catch (error) {
      console.log(`FALLO al enviar: ${error.code ?? ''} ${error.message}`);
    }
  } else {
    console.log('Pasa un destinatario como argumento para enviar una prueba real, p. ej.: node scripts/probar-correo.mjs tu@correo.com');
  }
}
