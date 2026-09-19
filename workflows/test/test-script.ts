import { runOnceForAllItems } from '@n8n/workflow-sdk';

// runOnceForAllItems stringifies the fn; the SDK parser requires a named parameter.
export const testScript = runOnceForAllItems((_ctx) => {
  console.log('Hello world');
  return [{ json: { message: 'Hello world' } }];
});
