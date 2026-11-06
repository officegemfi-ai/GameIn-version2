// Wires the prototype page (index.html) for live mode. Run once on a prototype build:
//
//   node live/tools/patch-index.mjs index.html
//
// It adds the live scripts, lets the app's engine functions hand over to the live adapter (GIX) when there is one,
// shares a few of the app's own helpers with the adapter (GIXI), and swaps the demo-only constants a few screens use.
// In demo mode none of this does anything: window.GIX only exists in live mode (live/boot.js). It refuses to run on a
// page that is already wired.
import fs from 'node:fs';

const file = process.argv[2] || 'index.html';
let src = fs.readFileSync(file, 'utf8');
if (src.includes('window.GIX&&GIX.')) {
  console.error(file + ' is already wired for live mode');
  process.exit(1);
}

const count = (s) => src.split(s).length - 1;
function once(find, replace) {
  const n = count(find);
  if (n !== 1) throw new Error(JSON.stringify(find.slice(0, 80)) + ' is in the page ' + n + ' times, expected once');
  src = src.replace(find, () => replace);
}

// 1. The engine functions the adapter can take over: what the screens read (deals, offers, threads, wallet, counts)
//    and every move (offers, funding, proof, approvals, renewals, messages)
const HOOKS = [
  // readers
  'bxSeed', 'bxSeed3', 'bxExtra', 'bxDeals', 'bxDealNow', 'bxDealFor', 'bxCreatorOffers', 'bxCreatorDeals',
  'bxCreatorThreads', 'bxCreatorUnread', 'bxLink', 'bxThreads', 'bxBrandList', 'bxBrandTodo', 'bxNavB', 'bxMeAll',
  'bxMeTx', 'bxAllRel', 'bxNetOfId', 'bxOfferingsOf', 'bxCreatorItems', 'bxCreatorMs', 'bxCreatorProofs',
  'bxLastBrand', 'bxCurBrand',
  // moves
  'bxSendOffer', 'bxReply', 'bxAcceptCounter', 'bxCounter', 'bxCloseOffer', 'bxUpload', 'bxRelease', 'bxUndoRelease',
  'bxChanges', 'bxFundNow', 'bxClearNow', 'bxRenAct', 'bxCreatorRead', 'bxCreatorSay', 'bxCreatorAct', 'bxPitch',
  'bxCreatorRenew', 'bxUploadC', 'bxTryUpload',
  // seats: an account without a brand (or without a creator profile) is offered to create one
  'bxGoBrand', 'bxGoCreator', 'GibBrandHQ',
];
for (const name of HOOKS) {
  const key = 'function ' + name + '(';
  const n = count(key);
  if (n !== 1) throw new Error(key + ' is in the page ' + n + ' times, expected once');
  let i = src.indexOf(key) + key.length;
  for (let depth = 1; depth; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
  }
  while (src[i] !== '{') i++;
  src = src.slice(0, i + 1) + 'if(window.GIX&&GIX.' + name + ')return GIX.' + name + '.apply(this,arguments);' + src.slice(i + 1);
}

// 2. The app's own helpers and records the adapter builds on (live mode only)
once(
  '\nfunction GibBrandHQ(',
  '\nif(window.GAMEIN_MODE==="live")window.GIXI={Se,jB,_w,Ja,GBX,bxUI,bxCtx,bxRaw,bxStamp,bxDay,bxDate,bxToday,bxCur,' +
    'bxOSt,bxShares,bxFeeStep,bxNet,bxC,bxFeeC,bxPmLabel,bxBrandOf,bxMe,bxEnt,bxEqItems,bxMod,bxPkgItems,bxGoBrand,' +
    'bxGoCreator,bxBrandEv,bxCreatorEv,bxNext,BXM,BXF,bxLeft,bxAgo,bxHr,React:q};\nfunction GibBrandHQ(',
);

// 3. Demo-only constants: the made-up wallet base and history, the demo's own offers, deals and threads, packages
//    kept in this browser, and two made-up receipts
// who "me" is: the signed-in person's creator profile (the demo always says Instant Shock)
once('function Vw(){let e=jB[0],', 'function Vw(){let e=window.GIX&&GIX.me?GIX.me():jB[0],');
once('const bxMe=()=>(jB&&jB[0])', 'const bxMe=()=>(window.GIX&&GIX.me?GIX.me():(jB&&jB[0]))');
once('useState)(1586)', 'useState)(window.GIX?0:1586)');
once('useState)(EQ)', 'useState)(window.GIX?[]:EQ)');
once('useState)(TQ)', 'useState)(window.GIX?[]:TQ)');
once('useState)(DQ)', 'useState)(window.GIX?[]:DQ)');
once('bxPkgLoad(kQ)', 'bxPkgLoad(window.GIX?[]:kQ)');
once('offerings:N,', 'offerings:window.GIX&&GIX.offerings?GIX.offerings(N):N,');
once('setOfferings:M,', 'setOfferings:window.GIX&&GIX.setOfferings||M,');
once('addOffering:h_', 'addOffering:window.GIX&&GIX.addOffering||h_');
once('updateOffering:g_', 'updateOffering:window.GIX&&GIX.updateOffering||g_');
once('removeOffering:v_', 'removeOffering:window.GIX&&GIX.removeOffering||v_');
once('Se(18412.3+', 'Se((window.GIX&&GIX.lifetimeBase?GIX.lifetimeBase():18412.3)+');
once('...UJ]', '...(window.GIX?[]:UJ)]');
once('const inv=B.S.inv.concat([', 'const inv=window.GIX?B.S.inv.filter(r=>!r.bid||r.bid===brand.id):B.S.inv.concat([');
// a wire's reference comes from the database when the payment is made; the brand header isn't a demo
once(
  'const ref="GI-"+String(d.id).toUpperCase()+"-"+(list[0]?list[0].i+1:1)',
  'const ref=window.GIX?"shown once you confirm":"GI-"+String(d.id).toUpperCase()+"-"+(list[0]?list[0].i+1:1)',
);
once('H("small",null,"you are the brand (demo)")', 'H("small",null,window.GIX?"you are the brand":"you are the brand (demo)")');
// a proof card shows the creator's real evidence (their link, their file) instead of the demo's made-up checks
once(
  'H("span",null,p.creator+", "+p.deal),H("ul",{className:"gbw-checks","aria-label":"Automatic proof checks"},',
  'H("span",null,p.creator+", "+p.deal),window.GIX&&GIX.proofEvidence?GIX.proofEvidence(p,H):H("ul",{className:"gbw-checks","aria-label":"Automatic proof checks"},',
);
once(
  'H("small",null,"proof.mp4")),\n  H("div",{className:"gbw-proof__t"}',
  'H("small",null,window.GIX?(p.file?"file":"link"):"proof.mp4")),\n  H("div",{className:"gbw-proof__t"}',
);

// releasing $1,000 or more asks first, naming the creator who's paid (the demo always paid "me", Instant Shock)
once(
  '"<b>Release "+Se(p.value)+"?</b> This pays "+(ME&&ME.name||"the creator")+" from escrow',
  '"<b>Release "+Se(p.value)+"?</b> This pays "+(window.GIX?p.creator:(ME&&ME.name||"the creator"))+" from escrow',
);

// 4. The scripts: which mode, before anything else; the loop switch-off just before the app
once('<script id="gamein-app-brand-v25">', '<script src="live/config.js"></script><script src="live/boot.js"></script>\n<script id="gamein-app-brand-v25">');
once('<script>(()=>{var O_=Object.create;', '<script src="live/pre-bundle.js"></script>\n    <script>(()=>{var O_=Object.create;');

fs.writeFileSync(file, src);
console.log('wired ' + file + ': ' + HOOKS.length + ' engine hooks');
