export const buildMiniRulesBody = ({ record = 'FRN' } = {}) => '<MiniRule_GetFromRec xmlns="http://xml.amadeus.com/TMRXRQ_23_1_1A">'
  + `<groupRecords><recordID><referenceType>${record}</referenceType><uniqueReference>ALL</uniqueReference></recordID></groupRecords>`
  + '</MiniRule_GetFromRec>';
