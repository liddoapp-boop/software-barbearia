# Fase 1.1.7 - Certificado Let's Encrypt real

Data: 2026-06-15

## Objetivo
Substituir o certificado Let's Encrypt staging/teste de `barbearia.76-13-161-250.nip.io` por um certificado real e confiavel, sem deploy, restart PM2, migration, seed ou alteracao de codigo da aplicacao.

## Estado inicial
Git:
- Branch `main` alinhada com `origin/main`.
- `.env` nao apareceu no status.
- `test-results/` apareceu apenas como untracked.
- Documentacao da Fase 1.1.5 seguia pendente no working tree e foi preservada.

Servicos:
- PM2 online, incluindo `software-barbearia`.
- Nginx ativo.
- PostgreSQL ativo.
- UFW ativo com `22/tcp`, `80/tcp` e `443/tcp` permitidos.
- UFW negando `3333/tcp`.

Nginx:
- `nginx -t`: `syntax is ok` e `test is successful`.
- HTTP em `/health` retornava `301` para HTTPS.
- HTTPS em `/health` retornava `200 OK` com `-k`.

DNS:
- `barbearia.76-13-161-250.nip.io` resolveu para `76.13.161.250`.

## Certificado anterior
`certbot certificates` registrava o certificado da barbearia como teste:

```text
Certificate Name: barbearia.76-13-161-250.nip.io
Expiry Date: 2026-08-22 02:51:29+00:00 (INVALID: TEST_CERT)
```

OpenSSL antes da emissao:

```text
issuer=C = US, O = Let's Encrypt, CN = (STAGING) Baloney Bulgur YE2
subject=CN = barbearia.76-13-161-250.nip.io
notBefore=May 24 02:51:30 2026 GMT
notAfter=Aug 22 02:51:29 2026 GMT
```

A configuracao de renovacao anterior apontava para:

```text
server = https://acme-staging-v02.api.letsencrypt.org/directory
```

## Emissao do certificado real
Comando executado, sem `--staging`, sem `--test-cert` e sem dry-run:

```text
certbot --nginx -d barbearia.76-13-161-250.nip.io --cert-name barbearia.76-13-161-250.nip.io --force-renewal --server https://acme-v02.api.letsencrypt.org/directory --redirect --non-interactive --agree-tos
```

Resultado:
- Certificado recebido com sucesso.
- Certificado salvo em `/etc/letsencrypt/live/barbearia.76-13-161-250.nip.io/fullchain.pem`.
- Chave salva em `/etc/letsencrypt/live/barbearia.76-13-161-250.nip.io/privkey.pem`.
- Certificado instalado em `/etc/nginx/sites-enabled/software-barbearia`.
- Expiracao informada pelo Certbot: `2026-09-13`.
- Certbot manteve tarefa agendada de renovacao automatica.

## Validacao do Nginx
Apos emissao:

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

Reload executado:

```text
systemctl reload nginx
```

Status apos reload:
- Nginx `active (running)`.
- `ExecReload` concluido com `status=0/SUCCESS`.

## HTTPS sem -k
`curl -I https://barbearia.76-13-161-250.nip.io/health`:
- `HTTP/1.1 200 OK`
- `Content-Type: application/json; charset=utf-8`

`curl https://barbearia.76-13-161-250.nip.io/health`:

```json
{"ok":true,"authEnforced":true}
```

## Certificado final
OpenSSL apos emissao:

```text
issuer=C = US, O = Let's Encrypt, CN = YE1
subject=CN = barbearia.76-13-161-250.nip.io
notBefore=Jun 15 11:54:15 2026 GMT
notAfter=Sep 13 11:54:14 2026 GMT
```

`certbot certificates` apos emissao:

```text
Certificate Name: barbearia.76-13-161-250.nip.io
Serial Number: 6cfb02f2fd667441fdb85949d62247893d0
Key Type: ECDSA
Domains: barbearia.76-13-161-250.nip.io
Expiry Date: 2026-09-13 11:54:14+00:00 (VALID: 89 days)
```

Configuracao de renovacao final:

```text
account = 63b9db15a2b81323b5a47ff5c7cb6604
server = https://acme-v02.api.letsencrypt.org/directory
authenticator = nginx
installer = nginx
key_type = ecdsa
```

## Renovacao dry-run
Primeira execucao de `certbot renew --dry-run` foi interrompida porque o Certbot aplicou atraso aleatorio de renovacao de aproximadamente 254 segundos antes de iniciar a simulacao.

Execucao efetiva:

```text
certbot renew --dry-run --no-random-sleep-on-renew
```

Resultado:

```text
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/barbearia.76-13-161-250.nip.io/fullchain.pem (success)
  /etc/letsencrypt/live/liddo.76-13-161-250.nip.io/fullchain.pem (success)
```

## Firewall e porta 3333
UFW final:
- `Status: active`
- `Default: deny (incoming), allow (outgoing), deny (routed)`
- `22/tcp (OpenSSH)` permitido.
- `80/tcp` permitido.
- `443/tcp` permitido.
- `3333/tcp` negado.

Validacao externa ampliada de `76.13.161.250:3333`:
- 8 nos externos retornaram timeout.

Validacao externa de `barbearia.76-13-161-250.nip.io:443`:
- 3 nos externos conectaram com sucesso.

## Status final de servicos
PM2:
- Todos os processos listados permaneceram `online`.
- `software-barbearia` permaneceu `online`.

Nginx:
- `active (running)`.

PostgreSQL:
- `active (exited)` no unit manager, com banco local preservado.

## Acoes nao executadas
- Deploy nao executado.
- PM2 nao reiniciado.
- Migration nao executada.
- Seed nao executado.
- Codigo da aplicacao nao alterado.
- Regras financeiras e RBAC backend nao alterados.
- `.env`, segredos e `DATABASE_URL` nao foram expostos.
- `test-results/` nao foi commitado.
- Nenhum certificado foi apagado manualmente.

## Riscos restantes
1. Validacao manual em navegador/celular ainda deve ser feita para confirmar experiencia do usuario final.
2. O app continua escutando em `0.0.0.0:3333`, com exposicao externa mitigada por UFW.
3. Ha listener em `*:8080`; segue bloqueado por politica padrao de entrada salvo regras explicitas futuras.

## Decisao final
APROVADO COM RESSALVAS.

Motivo da ressalva:
- Certificado real foi emitido e validado por curl/OpenSSL, mas ainda falta validacao manual em navegador/celular.

## Proxima etapa recomendada
1. Validar manualmente `https://barbearia.76-13-161-250.nip.io` em navegador desktop e celular.
2. Planejar bind do app em `127.0.0.1` para reduzir dependencia exclusiva do firewall.
3. Revisar listener em `*:8080`.
4. Preparar proxima fase de hardening/release sem deploy automatico.
