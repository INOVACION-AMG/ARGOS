-- CreateTable
CREATE TABLE "SolicitudProductoAmg" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numeroCliente" TEXT NOT NULL,
    "nombrePerfil" TEXT,
    "nombrePedido" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltoEn" TIMESTAMP(3),

    CONSTRAINT "SolicitudProductoAmg_pkey" PRIMARY KEY ("id")
);
