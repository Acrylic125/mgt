import { z } from 'zod';
import fixture from '../../../temp.json';

const tasks = z.array(z.object({
  title: z.string().regex(/^[^/]+\/[^/]+ Fix CVEs$/),
  description: z.string().regex(/Issues:\n\S[\s\S]*\n\n## Instruction/),
})).min(1).parse(fixture);

const tickets = tasks.map((task) => ({
  title: task.title,
  key: `audit-${task.title.slice(0, -' Fix CVEs'.length)}`,
  description: task.description,
}));

export const testNotionScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode: `return ${JSON.stringify(tickets)}.map((task) => ({ json: task }));`,
};
