# Modo local do piloto

## Causa

O login do owner `bgeovane265@gmail.com` falhava quando a API era iniciada com o ambiente local padrao, porque o `.env` aponta para o banco `barbearia`. O owner do piloto existe no banco `barbearia_pilot`.

## Comandos

- `npm run dev`: continua sendo o modo local padrao do projeto.
- `npm run dev:pilot`: modo explicito do piloto local. Ele carrega `.env.pilot.local` e recusa iniciar se o banco nao for `barbearia_pilot` em host local/loopback.

## Garantias desta correcao

- A senha do owner nao foi alterada.
- Nenhum banco foi resetado.
- Nao houve seed, migration ou alteracao de dados operacionais.
- O arquivo `.env.pilot.local` e local e nao deve ser versionado.
- `.env*.local` esta ignorado pelo Git.

## Uso

Para iniciar o piloto local:

```bash
npm run dev:pilot
```

Se `.env.pilot.local` nao existir, crie-o a partir do `.env` local e troque apenas o nome do banco no `DATABASE_URL` de `barbearia` para `barbearia_pilot`.

## Validacao 2026-07-10

- `npm run dev:pilot` subiu a API local na porta `3333`.
- `/health` respondeu com sucesso.
- `/public/business` retornou `Barbearia Geovane Borges`.
- `/agendamento` carregou HTML com sucesso.
- `/public/services` retornou 5 servicos: Barba, Corte, Hidratacao, Luzes e Pigmentacao.
- Estoque ativo do piloto confirmado em leitura direta: Bucha 3, Condicionador 10, Gel 30, Mascara 10, Pomada 10 e Shampoo 10.
- `SMOKE_OWNER_EMAIL` e `SMOKE_OWNER_PASSWORD` nao estavam definidos no ambiente local; por isso, a validacao autenticada real do owner deve ser feita com a senha digitada fora do Git, sem resetar senha.
