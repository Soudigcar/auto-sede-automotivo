# Hardening separado: GET de foto de perfil

Fora do escopo da Fase 2A-1. Nenhuma correção nesta branch.

`PipelineLeadAvatar` chama `useStoreWhatsappProfilePictures`, que pode consultar
GET `/api/store-whatsapp/profile-picture`. Essa rota chama
`refreshWhatsappProfilePicture`, podendo consultar o provider e persistir cache
em Production. Portanto, abrir a Pipeline não é uma conferência necessariamente
sem efeitos colaterais.

Recomendação futura: separar leitura de cache e atualização, com autorização,
controle de concorrência e observabilidade próprios. Não executar essa rota como
sonda de auditoria read-only. Não usá-la nos testes desta entrega.
