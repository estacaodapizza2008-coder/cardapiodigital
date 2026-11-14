-- Proteção contra pedido duplicado.
-- Rode ESTE ARQUIVO NO BANCO ANTES de publicar o backend novo
-- (o código novo grava essa coluna; sem ela, os pedidos dão erro 500).
-- Rode os dois comandos, um de cada vez.

ALTER TABLE pedidos ADD COLUMN chave_idempotencia VARCHAR(64) DEFAULT NULL;

ALTER TABLE pedidos ADD UNIQUE INDEX uq_pedidos_chave_idempotencia (chave_idempotencia);
