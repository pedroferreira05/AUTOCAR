# AUTOCAR

Aplicativo para controle de estoque, atendimentos e financeiro de uma estética automotiva.

## Organização

- `aplicativo`: telas e funções do aplicativo.
- `backend`: API e conexão com o PostgreSQL.

## Como iniciar o backend

```powershell
cd backend
npm.cmd install
npm.cmd run dev
```

Antes de iniciar, copie `.env.example` para `.env` e configure os dados do PostgreSQL.

## Como iniciar o aplicativo

```powershell
cd aplicativo
npm.cmd install
npx.cmd expo start -c
```

Copie `.env.example` para `.env.local` e coloque o IP do computador:

```text
EXPO_PUBLIC_API_URL=http://IP_DO_COMPUTADOR:3000/api
```

O celular e o computador precisam estar conectados à mesma rede.

## Segurança

Senhas, configurações locais, dependências e fotos cadastradas não são enviadas ao GitHub.