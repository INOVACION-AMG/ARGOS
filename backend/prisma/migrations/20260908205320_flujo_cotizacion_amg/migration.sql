-- CreateTable
CREATE TABLE "TarifaClienteAmg" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ajustePorcentaje" DOUBLE PRECISION NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifaClienteAmg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesionCotizacionAmg" (
    "id" TEXT NOT NULL,
    "numeroCliente" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SesionCotizacionAmg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TarifaClienteAmg_nombre_key" ON "TarifaClienteAmg"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "SesionCotizacionAmg_numeroCliente_key" ON "SesionCotizacionAmg"("numeroCliente");
