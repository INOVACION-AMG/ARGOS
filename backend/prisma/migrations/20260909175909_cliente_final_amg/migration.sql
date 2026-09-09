-- CreateTable
CREATE TABLE "ClienteFinalAmg" (
    "id" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "ultimaCotizacion" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteFinalAmg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClienteFinalAmg_nombreNormalizado_key" ON "ClienteFinalAmg"("nombreNormalizado");
