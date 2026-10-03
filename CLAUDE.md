# CRM Solar

## Idioma

- Todas as respostas do Claude são em português do Brasil (pt-BR), inclusive resumos, perguntas e explicações.

## Banco de dados (Supabase)

- Toda mudança de banco vira um arquivo novo em `supabase/migrations/`, numerado em sequência (`0011_nome.sql`, `0012_...`). Nunca edite uma migração que já foi aplicada.
- **Para aplicar uma migração, use sempre o MCP do Supabase** (servidor `supabase` em `.mcp.json`), com a ferramenta `apply_migration`, passando o nome do arquivo sem o número/extensão e o SQL do arquivo. Não use `supabase db push`, o SQL Editor nem `execute_sql` para isso.
- O projeto é o `npmgwdfyznxgimknmfqn`: passe como `project_id` em toda chamada. O endereço do servidor fica sem `?project_ref=` de propósito, porque com parâmetros o login OAuth falha com "Resource must be a valid MCP endpoint".
- Antes de aplicar, confira com `list_migrations` o que já está no banco, para não repetir nem pular nenhuma.
- Se o MCP do Supabase não estiver disponível (pedindo autenticação), não aplique por outro caminho: avise que é preciso autorizar o servidor pelo `/mcp` e deixe a migração pendente.
- Edge functions alteradas em `supabase/functions/` também são publicadas pelo MCP (`deploy_edge_function`).
