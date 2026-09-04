-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "motivoAtencion" TEXT,
ADD COLUMN     "requiereAtencion" BOOLEAN NOT NULL DEFAULT false;
