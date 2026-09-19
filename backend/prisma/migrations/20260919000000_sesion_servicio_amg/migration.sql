-- CreateTable
CREATE TABLE "SesionServicioAmg" (
    "id" TEXT NOT NULL,
    "numeroCliente" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionServicioAmg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SesionServicioAmg_numeroCliente_key" ON "SesionServicioAmg"("numeroCliente");
