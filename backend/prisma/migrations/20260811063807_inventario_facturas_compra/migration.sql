-- AlterTable
ALTER TABLE "Producto" ADD COLUMN     "existenciaKg" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FacturaCompra" (
    "id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "fecha" TIMESTAMP(3),
    "total" DECIMAL(10,2),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaCompraItem" (
    "id" TEXT NOT NULL,
    "facturaCompraId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "kilos" DECIMAL(10,2) NOT NULL,
    "costoUnitKg" DECIMAL(10,2),

    CONSTRAINT "FacturaCompraItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FacturaCompraItem" ADD CONSTRAINT "FacturaCompraItem_facturaCompraId_fkey" FOREIGN KEY ("facturaCompraId") REFERENCES "FacturaCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaCompraItem" ADD CONSTRAINT "FacturaCompraItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
