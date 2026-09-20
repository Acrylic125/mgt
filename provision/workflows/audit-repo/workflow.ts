import { expr, newCredential, node, trigger, workflow } from '@n8n/workflow-sdk';
import { auditScript } from './audit-script';
import { markDayCompleteScript, skipIfDoneTodayScript } from './day-gate';

const everyFifteen = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Every 15 minutes',
    parameters: {
      rule: {
        interval: [
          {
            field: 'minutes',
            minutesInterval: 15,
          },
        ],
      },
    },
  },
});

const webhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'repo-audit',
      responseMode: 'onReceived',
      options: {},
    },
  },
});

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Trigger' },
});

const skipIfDoneToday = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Skip if already completed today',
    parameters: {
      language: 'javaScript',
      ...skipIfDoneTodayScript,
    },
  },
});

const runAudit = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Audit configured repos',
    parameters: {
      language: 'javaScript',
      ...auditScript,
    },
  },
});

const sendTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send audit report',
    executeOnce: true,
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $env.TELEGRAM_CHAT_ID }}'),
      text: expr('{{ $json.text }}'),
      additionalFields: {
        appendAttribution: false,
        parse_mode: 'Markdown',
      },
    },
    credentials: {
      telegramApi: newCredential('Telegram account', 'pYoyBO3RKqURGq6h'),
    },
  },
});

const markDayComplete = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Mark calendar day complete',
    executeOnce: true,
    parameters: {
      language: 'javaScript',
      ...markDayCompleteScript,
    },
  },
});

export default workflow('audit-repo', 'Repo Audit', {
  timezone: 'Asia/Singapore',
  executionTimeout: 7200,
  executionOrder: 'v1',
})
  .add(everyFifteen)
  .to(skipIfDoneToday)
  .to(runAudit)
  .add(webhook)
  .to(runAudit)
  .add(manual)
  .to(runAudit)
  .add(runAudit)
  .to(sendTelegram)
  .to(markDayComplete);
