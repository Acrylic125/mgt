import { expr, ifElse, newCredential, nextBatch, node, splitInBatches, trigger, workflow } from '@n8n/workflow-sdk';
import { auditScript } from './audit-script';
import { markDayCompleteScript, skipIfDoneTodayScript } from './day-gate';
import { notionTasksScript } from './notion-tasks';
import { ticketPlanScript } from './ticket-plan';

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
        parse_mode: 'HTML',
      },
    },
    credentials: {
      telegramApi: newCredential('Telegram account', 'pYoyBO3RKqURGq6h'),
    },
  },
});

const prepareNotionTasks = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Prepare security tasks',
    parameters: {
      language: 'javaScript',
      ...notionTasksScript,
    },
  },
});

const listExistingTickets = node({
  type: 'n8n-nodes-base.notion',
  version: 3,
  config: {
    name: 'List existing security tickets',
    disabled: true,
    executeOnce: true,
    alwaysOutputData: true,
    parameters: {
      authentication: 'apiKey',
      resource: 'databasePage',
      operation: 'getAll',
      dataSourceId: {
        mode: 'id',
        value: '3e2d6e07-0119-80fe-85b1-000b276fc20b',
      },
      returnAll: true,
      filterType: 'none',
      simple: false,
    },
  },
});

const planTicketWrites = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Plan security ticket writes',
    parameters: {
      language: 'javaScript',
      ...ticketPlanScript,
    },
  },
});

const processTickets = splitInBatches({
  version: 3,
  config: {
    name: 'Process security tickets',
    parameters: { batchSize: 1 },
  },
});

const ticketExists = ifElse({
  version: 2.2,
  config: {
    name: 'Security ticket exists?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'strict' },
        conditions: [{
          leftValue: expr('{{ $json.pageId }}'),
          rightValue: '',
          operator: { type: 'string', operation: 'notEmpty' },
        }],
        combinator: 'and',
      },
    },
  },
});

const createNotionTask = node({
  type: 'n8n-nodes-base.notion',
  version: 3,
  config: {
    name: 'Create security task',
    disabled: true,
    parameters: {
      authentication: 'apiKey',
      resource: 'databasePage',
      operation: 'create',
      dataSourceId: {
        mode: 'id',
        value: '3e2d6e07-0119-80fe-85b1-000b276fc20b',
      },
      title: expr('{{ $json.title }}'),
      propertiesUi: {
        propertyValues: [
          { key: 'Ticket Key|rich_text', textContent: expr('{{ $json.key }}') },
          { key: 'Category|select', selectValue: 'Dev' },
          { key: 'Category Label|select', selectValue: 'Security' },
          { key: 'Status|select', selectValue: 'ToDo' },
        ],
      },
      contentType: 'markdown',
      markdown: expr('{{ $json.description }}'),
      simple: true,
    },
  },
});

const updateNotionTask = node({
  type: 'n8n-nodes-base.notion',
  version: 3,
  config: {
    name: 'Update security task',
    disabled: true,
    parameters: {
      authentication: 'apiKey',
      resource: 'databasePage',
      operation: 'update',
      pageId: {
        mode: 'id',
        value: expr('{{ $json.pageId }}'),
      },
      propertiesUi: {
        propertyValues: [
          { key: 'Name|title', title: expr('{{ $json.title }}') },
          { key: 'Ticket Key|rich_text', textContent: expr('{{ $json.key }}') },
          { key: 'Category|select', selectValue: 'Dev' },
          { key: 'Category Label|select', selectValue: 'Security' },
        ],
      },
      simple: true,
    },
  },
});

const replaceNotionTaskBody = node({
  type: 'n8n-nodes-base.notion',
  version: 3,
  config: {
    name: 'Replace security task report',
    disabled: true,
    parameters: {
      authentication: 'apiKey',
      resource: 'page',
      operation: 'updateMarkdown',
      pageId: {
        mode: 'id',
        value: expr('{{ $json.id }}'),
      },
      markdownUpdateType: 'replace_content',
      markdown: expr('{{ $("Plan security ticket writes").item.json.description }}'),
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

processTickets.onDone(markDayComplete);
processTickets.onEachBatch(ticketExists
  .onTrue!(updateNotionTask.to!(replaceNotionTaskBody.to!(nextBatch(processTickets))))
  .onFalse!(createNotionTask.to!(nextBatch(processTickets))));

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
  .to(prepareNotionTasks)
  .to(listExistingTickets)
  .to(planTicketWrites)
  .to(processTickets);
