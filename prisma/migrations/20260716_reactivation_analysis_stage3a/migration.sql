-- Etapa 3A: bloqueio explicito para analise somente leitura de reativacao.
ALTER TABLE "Client"
  ADD COLUMN "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false;
