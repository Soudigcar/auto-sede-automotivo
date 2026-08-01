// Contrato de integração entre a administração da landing e o editor visual.
// A administração seleciona a landing; o editor mantém o rascunho como fonte visual única.
export const CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT = 'auto-sede:campaign-visual-editor-open';
export const CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT = 'auto-sede:campaign-visual-editor-refresh';

export type CampaignVisualEditorOpenDetail = {
  campaignId?: string;
};

export type CampaignVisualEditorRefreshDetail = {
  campaignId?: string;
};
