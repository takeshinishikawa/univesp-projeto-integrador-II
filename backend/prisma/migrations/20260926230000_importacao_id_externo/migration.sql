-- AlterTable
ALTER TABLE `transacoes` ADD COLUMN `id_externo` VARCHAR(100) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `transacoes_usuario_id_id_externo_key` ON `transacoes`(`usuario_id`, `id_externo`);

