-- Contas, recorrências ignoradas, objetivos e aportes.
-- CreateTable
CREATE TABLE `contas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `nome` VARCHAR(60) NOT NULL,
    `tipo` ENUM('CONTA_CORRENTE', 'CARTAO_CREDITO', 'DINHEIRO', 'OUTRA') NOT NULL,
    `saldo_inicial` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `identificador_externo` VARCHAR(100) NULL,
    `arquivada` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `contas_usuario_id_nome_key`(`usuario_id`, `nome`),
    UNIQUE INDEX `contas_usuario_id_identificador_externo_key`(`usuario_id`, `identificador_externo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recorrencias_ignoradas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `chave` VARCHAR(150) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `recorrencias_ignoradas_usuario_id_chave_key`(`usuario_id`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `objetivos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `nome` VARCHAR(60) NOT NULL,
    `valor_alvo` DECIMAL(12, 2) NOT NULL,
    `prazo_ano` INTEGER NOT NULL,
    `prazo_mes` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `concluido_em` DATETIME(3) NULL,

    INDEX `objetivos_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `aportes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `objetivo_id` INTEGER NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `data` DATE NOT NULL,
    `observacao` VARCHAR(150) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `aportes_objetivo_id_idx`(`objetivo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- Todo usuário passa a ter uma "Conta principal", que recebe as transações que já existem.
INSERT INTO `contas` (`usuario_id`, `nome`, `tipo`, `saldo_inicial`)
SELECT `id`, 'Conta principal', 'CONTA_CORRENTE', 0 FROM `usuarios`;

-- AlterTable: conta_id entra nulo, é preenchido e só então vira obrigatório.
ALTER TABLE `transacoes` ADD COLUMN `conta_id` INTEGER NULL,
    ADD COLUMN `transferencia_id` VARCHAR(36) NULL;

UPDATE `transacoes` t
JOIN `contas` c ON c.`usuario_id` = t.`usuario_id` AND c.`nome` = 'Conta principal'
SET t.`conta_id` = c.`id`;

ALTER TABLE `transacoes` MODIFY `conta_id` INTEGER NOT NULL;

-- CreateIndex: a duplicidade da importação passa a ser por (usuário, conta, id externo).
-- O novo índice entra antes de o antigo sair, para a chave estrangeira de usuario_id nunca ficar sem índice.
CREATE UNIQUE INDEX `transacoes_usuario_id_conta_id_id_externo_key` ON `transacoes`(`usuario_id`, `conta_id`, `id_externo`);
DROP INDEX `transacoes_usuario_id_id_externo_key` ON `transacoes`;
CREATE INDEX `transacoes_conta_id_idx` ON `transacoes`(`conta_id`);
CREATE INDEX `transacoes_transferencia_id_idx` ON `transacoes`(`transferencia_id`);

ALTER TABLE `transacoes` ADD CONSTRAINT `transacoes_conta_id_fkey` FOREIGN KEY (`conta_id`) REFERENCES `contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contas` ADD CONSTRAINT `contas_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recorrencias_ignoradas` ADD CONSTRAINT `recorrencias_ignoradas_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `objetivos` ADD CONSTRAINT `objetivos_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aportes` ADD CONSTRAINT `aportes_objetivo_id_fkey` FOREIGN KEY (`objetivo_id`) REFERENCES `objetivos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

