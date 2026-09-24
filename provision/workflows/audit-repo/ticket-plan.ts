const jsCode = `
const source = $('Prepare security tasks').all();
const existingByKey = new Map();
const legacyByTitle = new Map();

for (const item of $input.all()) {
  const page = item.json;
  if (typeof page.id !== 'string') continue;

  const keyTexts = page.properties?.['Ticket Key']?.rich_text ?? [];
  const key = keyTexts.map((text) => text.plain_text ?? text.text?.content ?? '').join('').trim();
  const titleTexts = page.properties?.Name?.title ?? [];
  const title = titleTexts.map((text) => text.plain_text ?? text.text?.content ?? '').join('');

  if (key) {
    const normalizedKey = key.toLowerCase();
    if (existingByKey.has(normalizedKey)) {
      throw new Error('Duplicate Notion ticket key: ' + key);
    }
    existingByKey.set(normalizedKey, page.id);
  } else if (title) {
    if (legacyByTitle.has(title)) {
      throw new Error('Duplicate unkeyed Notion ticket title: ' + title);
    }
    legacyByTitle.set(title, page.id);
  }
}

const seen = new Set();
const output = [];
for (const item of source) {
  const ticket = item.json;
  if (typeof ticket.key !== 'string' || !ticket.key.startsWith('audit-') ||
      typeof ticket.title !== 'string' || typeof ticket.description !== 'string') {
    throw new Error('Invalid audit ticket input');
  }
  const normalizedKey = ticket.key.toLowerCase();
  if (seen.has(normalizedKey)) {
    throw new Error('Duplicate audit ticket input: ' + ticket.key);
  }
  seen.add(normalizedKey);

  const pageId = existingByKey.get(normalizedKey) ?? legacyByTitle.get(ticket.title) ?? '';
  output.push({ json: {
    key: ticket.key,
    title: ticket.title,
    description: ticket.description,
    pageId,
  } });
}

return output;
`.trim();

export const ticketPlanScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode,
};
