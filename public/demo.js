// Authored synthetic example. Never mixed into a live encounter.
const ref=['speech-1'];
const cue=(id,tag,text,state='to clarify',priority='routine',sourceIds=ref)=>({id,tag,text,detail:'',state,priority,sourceIds});
export const segments=[
 {id:'speech-1',text:'Adult with three days of fever, productive cough, shortness of breath and right-sided pleuritic chest pain. Temperature 39.1 Celsius. Heart rate 118, respiratory rate 28, oxygen saturation 91 percent on room air. Blood pressure 88 over 54. Respiratory infection is our working possibility. Medical history, medications and allergies have not yet been established.'},
 {id:'speech-2',text:'Please obtain a blood gas with lactate, blood cultures and a chest X-ray. Check the medication allergies. These have been requested, not done. What findings would make us reconsider pneumonia as the main diagnosis?'},
 {id:'speech-3',text:'Correction: the initial blood pressure was 108 over 64, not 88 over 54. Lactate has returned at 2.1 millimoles per litre. Blood cultures have now been collected. The allergy history is still unknown.'},
 {id:'speech-4',text:'On reassessment, oxygen saturation is 95 percent on supplemental oxygen, respiratory rate 24. Chest X-ray reports right lower lobe consolidation. No antibiotics have been administered yet. What remains to be checked before choosing an antibiotic?'}
];
export function snapshot(step=0){
 const corrected=step>=2,reassessed=step>=3,requested=step>=1;
 const vitals=[['bp','BP',corrected?'108/64':'88/54','mmHg'],['hr','HR','118','/min'],['rr','RR',reassessed?'24':'28','/min'],['spo2','SpO₂',reassessed?'95%':'91%',reassessed?'on O₂':'room air'],['temp','T','39.1','°C']].map(([id,label,value,unit])=>({id,label,value,unit,sourceIds:id==='bp'&&corrected?['speech-1','speech-3']:['rr','spo2'].includes(id)&&reassessed?['speech-1','speech-4']:ref}));
 for(const vital of vitals){const flag=({temp:['high','Adult fever'],hr:['high','Adult tachycardia'],rr:['high','Adult tachypnea'],spo2:reassessed?['none','']:['low','Low oxygen saturation on room air'],bp:corrected?['none','']:['low','Low blood pressure']})[vital.id];[vital.flag,vital.flagReason]=flag;}
 if(corrected)vitals.push({id:'lactate-vital',label:'Lactate',value:'2.1',unit:'mmol/L',sourceIds:['speech-3']});
 const data = {
 assessment:{
  summary:'Fever · productive cough · dyspnea · pleuritic pain'+(reassessed?' · RLL consolidation':''),vitals,
  differential:[
   {id:'pneumonia',name:'Pneumonia',rank:'leading',cue:reassessed?'Fever, cough; RLL consolidation':'Fever + productive cough; focal chest findings?',sourceIds:reassessed?['speech-1','speech-4']:ref},
   {id:'pe',name:'Pulmonary embolism',rank:'urgent',cue:'Pleuritic pain; VTE risk / disproportionate hypoxemia?',sourceIds:ref},
   {id:'viral',name:'Viral LRTI',rank:'consider',cue:'Exposure, viral testing, bacterial coinfection?',sourceIds:ref},
   {id:'effusion',name:'Parapneumonic effusion',rank:'consider',cue:'Asymmetric breath sounds / pleural fluid?',sourceIds:ref},
   {id:'hf',name:'Acute heart failure',rank:'consider',cue:'Orthopnea, JVP, edema, diffuse B-lines?',sourceIds:ref},
   {id:'ptx',name:'Pneumothorax',rank:'urgent',cue:'Abrupt onset, unilateral loss of air entry?',sourceIds:ref}
  ],
  history:[
   cue('h-course','HPI','3 days: fever, productive cough, dyspnea','reported','key'),
   cue('h-pain','HPI','Right pleuritic chest pain','reported'),
   cue('h-progression','HPI','Progression · baseline exertion / oxygen need','to clarify','key'),
   cue('h-sputum','ASSOC','Sputum / hemoptysis · rigors'),
   cue('h-sepsis','ASSOC','Confusion · reduced urine output / intake','to clarify','key'),
   cue('h-vte','ASSOC','Leg pain / swelling · syncope'),
   cue('h-hf','ASSOC','Orthopnea / PND · peripheral edema'),
   cue('h-other','ASSOC','Urinary / abdominal symptoms · other source'),
   cue('h-lung','PMH','COPD / asthma · cardiac / renal disease'),
   cue('h-immune','PMH','Immunosuppression · prior resistant infection'),
   cue('h-meds','MEDS','Recent antibiotics · steroids / biologics · anticoagulants'),
   cue('h-allergy','ALLERGY','Drug + reaction / severity; still unknown','to clarify','key',corrected?['speech-1','speech-3']:ref),
   cue('h-exposure','SOCIAL','Sick contacts · travel · aspiration risk'),
   cue('h-smoking','SOCIAL','Smoking / vaping · alcohol'),
   cue('h-risk','RISK','Immobility / surgery · previous VTE · estrogen / pregnancy if relevant'),
   cue('h-baseline','COLLAT','Baseline function · prior cultures · care preferences')
  ],
  exam:[
   cue('e-primary','PRIMARY','Airway / speech · work of breathing · perfusion','to examine','key'),
   cue('e-neuro','GEN','Alertness · distress · hydration','to examine','key'),
   cue('e-chest','RESP','Focal crackles / bronchial breathing','to examine','key'),
   cue('e-air','RESP','Air entry symmetry · wheeze · percussion dullness','to examine'),
   cue('e-effort','RESP','Accessory muscles / fatigue · ability to speak','to examine'),
   cue('e-cvs','CVS','Cap refill / extremity temperature · rhythm','to examine','key'),
   cue('e-hf','CVS','JVP · edema · new murmur','to examine'),
   cue('e-calf','MSK','Unilateral calf swelling / tenderness','to examine'),
   cue('e-abdo','ABDO','Tenderness / alternate source','to examine'),
   cue('e-skin','SKIN','Mottling · rash · cellulitis / wounds','to examine')
  ]
 },
 plan:{
  management:[
   cue('m-monitor','RESUS','Monitor · IV access · repeat BP / perfusion','consider','key'),
   cue('m-oxygen','RESUS',reassessed?'Supplemental O₂ reported; SpO₂ 95%':'O₂ for hypoxemia; titrate to target',reassessed?'done':'consider','key',reassessed?['speech-1','speech-4']:ref),
   cue('m-fluid','RESUS',corrected?'BP corrected to 108/64; reassess perfusion before fluids':'If hypoperfused: crystalloid bolus → reassess / check overload','consider','key',corrected?['speech-1','speech-3']:ref),
   {...cue('m-abx','MED','Ceftriaxone','consider','key'),dose:'2 g',route:'IV q24h',detail:'CAP regimen'},
   {...cue('m-azithro','MED','Azithromycin','consider','key'),dose:'500 mg',route:'IV/PO initially',detail:'with ceftriaxone · QT / interactions'},
   cue('m-cbc','LABS','CBC · lytes / Cr · glucose · LFTs','consider','key'),
   cue('m-lactate','LABS',corrected?'VBG / lactate → 2.1 mmol/L':'VBG + lactate',corrected?'result':requested?'requested':'consider','key',corrected?['speech-2','speech-3']:requested?['speech-2']:ref),
   cue('m-cultures','LABS',corrected?'Blood cultures collected; results pending':'Blood cultures before antibiotics if no material delay',corrected?'done':requested?'requested':'consider','routine',corrected?['speech-2','speech-3']:requested?['speech-2']:ref),
   cue('m-virus','LABS','Viral testing if it changes treatment / isolation','consider'),
   cue('m-extra','LABS','Coags if indicated · troponin if ischemic features','consider'),
   {...cue('m-cxr','IMG','CXR',reassessed?'result':requested?'requested':'consider','key',reassessed?['speech-2','speech-4']:requested?['speech-2']:ref),detail:reassessed?'RLL consolidation':'consolidation / effusion?'},
   cue('m-us','IMG','POCUS: lung / pleura / heart if useful','consider'),
   cue('m-ecg','IMG','ECG: ischemia / arrhythmia?','consider'),
   cue('m-pe','IMG','PE pathway if probability warrants','consider'),
   cue('m-recheck','MON','Reassess RR / SpO₂ / O₂ need · BP / mentation · urine output','consider','key'),
   cue('m-escalate','CONSULT','Escalate: persistent hypoperfusion / rising O₂ or ventilatory support','consider'),
   cue('m-dispo','DISPO','Disposition: O₂ need / stability / comorbidity / response','consider'),
   cue('m-comm','COMM','Treatment response / escalation plan · care preferences','consider')
  ],
  answer:requested?reassessed?{
   id:'abx-check',question:'Before choosing an antibiotic?',sourceIds:['speech-4'],points:['β-lactam allergy: reaction and severity still unknown.','Prior MRSA / Pseudomonas or recent IV antibiotics?','QT interval, interacting drugs, pregnancy when relevant.','Severity determines regimen, route and level of care.']
  }:{
   id:'alternative-dx',question:'What would change the leading diagnosis?',sourceIds:['speech-2'],points:['VTE risk + disproportionate hypoxemia → PE.','Orthopnea / raised JVP / B-lines → cardiac failure.','Sudden pain + absent unilateral air entry → pneumothorax.','Pleural fluid / persistent fever → complicated pneumonia.']
  }:null
 }
 };
 const labels={
  'h-course':['Fever / cough / dyspnea','3 days'],
  'h-pain':['Pleuritic pain','right-sided'],
  'h-progression':['Progression / baseline function','O₂ requirement?'],
  'h-sepsis':['Confusion / oliguria','perfusion'],
  'h-vte':['Leg swelling / syncope','PE'],
  'h-hf':['Orthopnea / PND / edema','HF'],
  'h-other':['Urinary / abdominal symptoms','other source'],
  'h-meds':['Recent antibiotics / steroids / anticoagulants',''],
  'h-allergy':['Drug allergy + reaction','unknown'],
  'e-primary':['Airway / breathing / perfusion',''],
  'e-cvs':['Cap refill / cool extremities / rhythm',''],
  'e-chest':['Focal crackles / bronchial breathing',''],
  'm-cultures':['Blood cultures',corrected?'collected · results pending':'before abx; avoid material delay'],
  'm-lactate':['VBG + lactate',corrected?'lactate 2.1 mmol/L':''],
  'm-us':['POCUS','lung / pleura / cardiac function'],
  'm-ecg':['ECG','ischemia / rhythm / QT'],
  'm-pe':['PE pathway','if clinical probability warrants'],
  'm-recheck':['RR / SpO₂ / BP / urine output','after each intervention'],
  'm-escalate':['Critical care','persistent hypoperfusion / rising O₂'],
  'm-dispo':['Admit','O₂ requirement / instability / response'],
  'm-comm':['Care preferences / escalation plan','']
 };
 for(const item of [...data.assessment.history,...data.assessment.exam,...data.plan.management]){
  if(labels[item.id])[item.text,item.detail]=labels[item.id];
 }
 return data;
}
