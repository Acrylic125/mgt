const jsCode = `
const LF = String.fromCharCode(10);
const tasks = $('Audit configured repos').first().json.tasks;
const output = [];

if (tasks.length === 0) {
  // There is no Notion output item to carry the completion marker forward.
  const staticData = $getWorkflowStaticData('global');
  staticData.lastCompletedDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
  return output;
}

for (const task of tasks) {
  if (typeof task.mrBody !== 'string' || task.mrBody.trim().length === 0) {
    throw new Error('Audit MR description is empty for ' + task.repo);
  }

  const description = [
    '## Audit Report',
    'Repo: ' + task.repo,
    'MR: ' + task.mrUrl,
    'Branch: ' + task.mrBranch,
    'Issues:',
    task.mrBody,
    '',
    '## Instruction',
    'The general approach is to work **from the direct dependency down**, then use overrides only for gaps upstream has not fixed:',
    '',
    '1. **Trace each finding** with \`pnpm why\` to see which direct package brings it in.',
    '2. **Remove unused direct packages.** This can eliminate an entire vulnerable dependency chain.',
    '3. **Update or replace the direct package** and adapt code where its API changed. This is the durable fix, especially when a transitive package has no patched release.',
    '4. **Use a targeted override** if the direct package still selects a vulnerable transitive version and the patched version is compatible.',
    '5. **Verify** with a fresh install, \`pnpm audit\`, type checking, a build, and relevant tests. Remove overrides once upstream updates make them unnecessary.',
  ].join(LF);

  output.push({ json: {
    title: task.repo + ' Fix CVEs',
    key: 'audit-' + task.repo,
    description: description,
  } });
}

return output;
`.trim();

export const notionTasksScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode,
};
