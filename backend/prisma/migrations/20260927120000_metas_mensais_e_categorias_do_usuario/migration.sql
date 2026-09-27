-- AlterTable
ALTER TABLE `categorias` ADD COLUMN `usuario_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `usuarios` DROP COLUMN `orcamento_limite`;

-- CreateTable
CREATE TABLE `metas_mensais` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `ano` INTEGER NOT NULL,
    `mes` INTEGER NOT NULL,
    `orcamento_limite` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `metas_mensais_usuario_id_ano_mes_key`(`usuario_id`, `ano`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `categorias_usuario_id_tipo_nome_key` ON `categorias`(`usuario_id`, `tipo`, `nome`);

-- AddForeignKey
ALTER TABLE `categorias` ADD CONSTRAINT `categorias_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metas_mensais` ADD CONSTRAINT `metas_mensais_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

