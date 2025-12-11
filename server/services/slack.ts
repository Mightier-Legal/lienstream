import { storage } from '../storage';
import { Logger } from './logger';

export interface SlackNotificationResult {
  success: boolean;
  error?: string;
}

export interface SyncNotificationData {
  totalLiens: number;
  syncedCount: number;
  failedCount: number;
  skippedCount?: number;
  duration?: string;
  triggeredBy?: 'manual' | 'scheduled';
}

export class SlackService {
  private webhookUrl: string | null = null;

  /**
   * Load Slack webhook URL from app settings
   */
  private async loadWebhookUrl(): Promise<string | null> {
    const setting = await storage.getAppSetting('SLACK_WEBHOOK_URL');
    this.webhookUrl = setting?.value || null;
    return this.webhookUrl;
  }

  /**
   * Check if Slack integration is configured
   */
  async isConfigured(): Promise<boolean> {
    const url = await this.loadWebhookUrl();
    return !!url && url.startsWith('https://hooks.slack.com/');
  }

  /**
   * Send a notification to Slack when liens are synced to Airtable
   */
  async sendSyncNotification(data: SyncNotificationData): Promise<SlackNotificationResult> {
    const webhookUrl = await this.loadWebhookUrl();

    if (!webhookUrl) {
      // Silently skip if not configured - this is expected
      return { success: true };
    }

    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      await Logger.warning('Invalid Slack webhook URL format', 'slack');
      return { success: false, error: 'Invalid webhook URL format' };
    }

    try {
      const emoji = data.failedCount > 0 ? '⚠️' : '✅';
      const status = data.failedCount > 0 ? 'completed with errors' : 'completed successfully';

      const blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} Airtable Sync ${status}`,
            emoji: true
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Liens:*\n${data.totalLiens}`
            },
            {
              type: 'mrkdwn',
              text: `*Synced:*\n${data.syncedCount}`
            },
            {
              type: 'mrkdwn',
              text: `*Failed:*\n${data.failedCount}`
            },
            {
              type: 'mrkdwn',
              text: `*Triggered By:*\n${data.triggeredBy === 'scheduled' ? 'Scheduled Automation' : 'Manual Sync'}`
            }
          ]
        }
      ];

      // Add duration if provided
      if (data.duration) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Completed in ${data.duration}`
            }
          ]
        } as any);
      }

      // Add skipped info if any liens were skipped
      if (data.skippedCount && data.skippedCount > 0) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_${data.skippedCount} liens skipped (missing PDFs)_`
            }
          ]
        } as any);
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ blocks })
      });

      if (!response.ok) {
        const errorText = await response.text();
        await Logger.error(`Slack notification failed: ${response.status} - ${errorText}`, 'slack');
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      await Logger.info(`Slack notification sent: ${data.syncedCount} liens synced to Airtable`, 'slack');
      return { success: true };

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      await Logger.error(`Slack notification error: ${errorMsg}`, 'slack');
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send a test message to verify the webhook is working
   * @param key - Optional settings key to use (defaults to SLACK_WEBHOOK_URL)
   */
  async sendTestMessage(key?: string): Promise<SlackNotificationResult> {
    // Load webhook URL from specified key or default
    const settingKey = key || 'SLACK_WEBHOOK_URL';
    const setting = await storage.getAppSetting(settingKey);
    const webhookUrl = setting?.value || null;

    if (!webhookUrl) {
      return { success: false, error: `Webhook not configured: ${settingKey}` };
    }

    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      return { success: false, error: 'Invalid webhook URL format. Must start with https://hooks.slack.com/' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '🔔 LienStream Test Notification',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: 'Your Slack integration is working! You will receive notifications here when liens are synced to Airtable.'
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Sent at ${new Date().toLocaleString()} • Key: \`${settingKey}\``
                }
              ]
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      await Logger.info(`Slack test message sent successfully via ${settingKey}`, 'slack');
      return { success: true };

    } catch (error: any) {
      const errorMsg = error.message || String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Send a custom message (for future use)
   */
  async sendCustomMessage(message: string): Promise<SlackNotificationResult> {
    const webhookUrl = await this.loadWebhookUrl();

    if (!webhookUrl) {
      return { success: false, error: 'Slack webhook URL not configured' };
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: message })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      return { success: true };

    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }
}

// Export singleton instance
export const slackService = new SlackService();
