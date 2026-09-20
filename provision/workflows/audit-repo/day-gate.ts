export const skipIfDoneTodayScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode: `
const staticData = $getWorkflowStaticData('global');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
if (staticData.lastCompletedDay === today) {
  return [];
}
return [{ json: { today: today } }];
`.trim(),
};

export const markDayCompleteScript = {
  mode: 'runOnceForAllItems' as const,
  jsCode: `
const staticData = $getWorkflowStaticData('global');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
staticData.lastCompletedDay = today;
return [{ json: { lastCompletedDay: today } }];
`.trim(),
};
