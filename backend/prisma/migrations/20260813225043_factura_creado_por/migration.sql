-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "creadoPorId" TEXT;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
