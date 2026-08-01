export const CAMPAIGN_VISUAL_EDITOR_OPEN_EVENT = 'auto-sede:campaign-visual-editor-open';
export const CAMPAIGN_VISUAL_EDITOR_REFRESH_EVENT = 'auto-sede:campaign-visual-editor-refresh';

export type CampaignVisualEditorOpenDetail = {
  campaignId?: string;
};

export type CampaignVisualEditorRefreshDetail = {
  campaignId?: string;
};
