-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN', 'ADMIN', 'USUARIO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'LIBERADA', 'CANCELADA', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PropositoComprobante" AS ENUM ('PAGO', 'REEMBOLSO');

-- CreateEnum
CREATE TYPE "AccionAfectada" AS ENUM ('REASIGNADA', 'REEMBOLSADA', 'CANCELADA_SIN_REEMBOLSO');

-- CreateTable
CREATE TABLE "Sede" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "apertura" TEXT NOT NULL,
    "cierre" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cancha" (
    "id" SERIAL NOT NULL,
    "sedeId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tarifaBaseCentavos" INTEGER NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cancha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" SERIAL NOT NULL,
    "sedeId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "diasSemana" INTEGER[],
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'USUARIO',
    "sedeId" INTEGER,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "montoTotalCentavos" INTEGER NOT NULL,
    "intento" INTEGER NOT NULL DEFAULT 1,
    "motivo" TEXT,
    "limiteHold" TIMESTAMPTZ(6),
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" SERIAL NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "proposito" "PropositoComprobante" NOT NULL,
    "rutaStorage" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueoCancha" (
    "id" SERIAL NOT NULL,
    "canchaId" INTEGER NOT NULL,
    "fecha" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloqueoCancha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccionReservaAfectada" (
    "id" SERIAL NOT NULL,
    "bloqueoId" INTEGER NOT NULL,
    "solicitudId" INTEGER NOT NULL,
    "accion" "AccionAfectada" NOT NULL,
    "detalle" TEXT,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccionReservaAfectada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMPTZ(6) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoLogin" (
    "id" SERIAL NOT NULL,
    "identificador" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoIntento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoHasta" TIMESTAMPTZ(6),

    CONSTRAINT "IntentoLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sede_nombre_key" ON "Sede"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Cancha_sedeId_nombre_key" ON "Cancha"("sedeId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Tarifa_sedeId_nombre_key" ON "Tarifa"("sedeId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Solicitud_canchaId_fecha_horaInicio_key" ON "Solicitud"("canchaId", "fecha", "horaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_rutaStorage_key" ON "Comprobante"("rutaStorage");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_solicitudId_proposito_key" ON "Comprobante"("solicitudId", "proposito");

-- CreateIndex
CREATE UNIQUE INDEX "AccionReservaAfectada_bloqueoId_solicitudId_key" ON "AccionReservaAfectada"("bloqueoId", "solicitudId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoLogin_identificador_key" ON "IntentoLogin"("identificador");

-- AddForeignKey
ALTER TABLE "Cancha" ADD CONSTRAINT "Cancha_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "Sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueoCancha" ADD CONSTRAINT "BloqueoCancha_canchaId_fkey" FOREIGN KEY ("canchaId") REFERENCES "Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccionReservaAfectada" ADD CONSTRAINT "AccionReservaAfectada_bloqueoId_fkey" FOREIGN KEY ("bloqueoId") REFERENCES "BloqueoCancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccionReservaAfectada" ADD CONSTRAINT "AccionReservaAfectada_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "Solicitud"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
