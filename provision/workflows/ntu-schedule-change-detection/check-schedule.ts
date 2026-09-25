export const checkScheduleScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode: `
const html = $input.first().json.html;
if (typeof html !== 'string') {
  throw new Error('NTU schedule response is not HTML text');
}

const cheerio = require('cheerio');
const page = cheerio.load(html);
const selectedValue = page('select[name="acadsem"] option[selected="selected"]').first().attr('value');
if (!selectedValue) {
  throw new Error('NTU schedule has no selected acadsem value');
}

const staticData = $getWorkflowStaticData('global');
if (staticData.previousAcadsem === selectedValue) {
  return [];
}

staticData.previousAcadsem = selectedValue;
return [{ json: { text: 'NTU Schedule Updated!' } }];
`.trim(),
};
