# Evolution API em produção

Este Compose é um artefato de deploy e não deve ser iniciado em desenvolvimento. Ele fixa a Evolution API 2.3.7 e as imagens oficiais de PostgreSQL e Redis por versão e digest.

Copie `.env.example` para `.env` apenas na VPS, preencha os valores reais e mantenha o arquivo com permissão restrita. A API é publicada somente em `127.0.0.1`; PostgreSQL e Redis ficam exclusivos na rede interna do Compose.

Antes de qualquer inicialização, valide o plano e os gates descritos em `.planning/DEPLOY_VPS.md`.
