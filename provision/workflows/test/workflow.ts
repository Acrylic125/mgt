import {
  workflow,
  node,
  trigger,
  newCredential,
  expr,
} from '@n8n/workflow-sdk';
import { testScript } from './test-script';

const start = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Manual Trigger' },
});

const sendTelegram = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Send Hello World',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: expr('{{ $env.TELEGRAM_CHAT_ID }}'),
      text: 'Hello world',
      additionalFields: {
        appendAttribution: false,
      },
    },
    credentials: {
      telegramApi: newCredential('Telegram Bot'),
    },
  },
});

const runScript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Run test-script',
    parameters: {
      language: 'javaScript',
      ...testScript,
    },
  },
});

// Fan-out from the same trigger so Telegram and the script run concurrently.
export default workflow('test', 'Test')
  .add(start)
  .to(sendTelegram)
  .add(start)
  .to(runScript);
