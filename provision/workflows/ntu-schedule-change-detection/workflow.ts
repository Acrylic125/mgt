import { expr, newCredential, node, trigger, workflow } from '@n8n/workflow-sdk';
import { checkScheduleScript } from './check-schedule';

const daily = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily at 08:00',
    parameters: {
      rule: {
        interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 8, triggerAtMinute: 0 }],
      },
    },
  },
});

const fetchSchedule = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.3,
  config: {
    name: 'Fetch NTU schedule',
    parameters: {
      method: 'GET',
      url: 'https://wish.wis.ntu.edu.sg/webexe/owa/aus_schedule.main',
      options: {
        response: {
          response: {
            responseFormat: 'text',
            outputPropertyName: 'html',
          },
        },
      },
    },
  },
});

const checkSchedule = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Check selected acadsem',
    parameters: {
      language: 'javaScript',
      ...checkScheduleScript,
    },
  },
});

const sendTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Notify NTU schedule update',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $env.TELEGRAM_CHAT_ID }}'),
      text: expr('{{ $json.text }}'),
      additionalFields: { appendAttribution: false },
    },
    credentials: {
      telegramApi: newCredential('Telegram account', 'pYoyBO3RKqURGq6h'),
    },
  },
});

export default workflow('ntu-schedule-change-detection', 'NTU Schedule Change Detection', {
  timezone: 'Asia/Singapore',
  executionOrder: 'v1',
})
  .add(daily)
  .to(fetchSchedule)
  .to(checkSchedule)
  .to(sendTelegram);
