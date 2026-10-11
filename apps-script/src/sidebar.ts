import type { Plan, PlanField } from "@logwizard/engine-logic";
import { logFields } from "@logwizard/engine-logic";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function control(f: PlanField): string {
  const name = `name="${esc(f.key)}" data-type="${f.type}"${f.required ? " required" : ""}`;
  const opts = f.options ?? [];
  switch (f.type) {
    case "long_text":
      return `<textarea ${name} rows="3"></textarea>`;
    case "date":
      return `<input type="date" ${name}>`;
    case "number":
      return `<input type="text" inputmode="decimal" ${name}>`;
    case "email":
      return `<input type="email" ${name}>`;
    case "url":
      return `<input type="url" ${name}>`;
    case "phone":
      return `<input type="tel" ${name}>`;
    case "choice":
      return `<select ${name}><option value=""></option>${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
    case "yes_no":
      return `<select ${name}><option value=""></option><option value="Yes">Yes</option><option value="No">No</option></select>`;
    case "multi_choice":
      return `<div class="multi" data-name="${esc(f.key)}" data-type="multi_choice">${opts
        .map((o) => `<label class="opt"><input type="checkbox" value="${esc(o)}"> ${esc(o)}</label>`)
        .join("")}</div>`;
    default:
      return `<input type="text" ${name}>`;
  }
}

/** Sidebar page for the owner, generated from the plan. All plan text is HTML-escaped. */
export function buildSidebarHtml(plan: Plan): string {
  const bases = plan.logs.filter((l) => l.fields);
  const sections = bases
    .map((log, i) => {
      const rows = logFields(plan, log.id)
        .map((f) => `<div class="row"><label>${esc(f.label)}${f.required ? " *" : ""}</label>${control(f)}</div>`)
        .join("");
      return `<form class="entry" data-log="${esc(log.id)}"${i === 0 ? "" : " hidden"}>${rows}</form>`;
    })
    .join("");
  const picker =
    bases.length > 1
      ? `<div class="row"><label>Log</label><select id="logpick">${bases.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select></div>`
      : "";
  return `<!DOCTYPE html><html><head><base target="_top"><style>
body{font-family:Arial,sans-serif;font-size:13px;margin:12px}
.row{margin-bottom:10px}label{display:block;font-weight:bold;margin-bottom:3px}
.opt{font-weight:normal}input[type=text],input[type=email],input[type=url],input[type=tel],input[type=date],select,textarea{width:100%;box-sizing:border-box}
button{padding:6px 14px}#msg{margin-top:10px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#146c2e}
</style></head><body>
<h3>${esc(plan.system_name)}: add entry</h3>${picker}${sections}
<button id="save">Save entry</button><div id="msg" role="status"></div>
<script>
(function(){
  var pick=document.getElementById('logpick');
  function active(){return document.querySelector('form.entry:not([hidden])');}
  if(pick){pick.onchange=function(){var fs=document.querySelectorAll('form.entry');for(var i=0;i<fs.length;i++){fs[i].hidden=fs[i].getAttribute('data-log')!==pick.value;}};}
  function show(t,c){var m=document.getElementById('msg');m.className=c;m.textContent=t;}
  document.getElementById('save').onclick=function(){
    var f=active(),values={},els=f.querySelectorAll('[name]'),i;
    for(i=0;i<els.length;i++){values[els[i].name]=els[i].value;}
    var multis=f.querySelectorAll('.multi');
    for(i=0;i<multis.length;i++){var picked=[],cbs=multis[i].querySelectorAll('input:checked');for(var j=0;j<cbs.length;j++){picked.push(cbs[j].value);}values[multis[i].getAttribute('data-name')]=picked;}
    var btn=this;btn.disabled=true;show('Saving...','');
    google.script.run.withSuccessHandler(function(r){btn.disabled=false;
      if(r&&r.ok){show(r.message,'ok');f.reset();}else{show((r&&r.errors?r.errors:['Something went wrong.']).join('\\n'),'err');}
    }).withFailureHandler(function(e){btn.disabled=false;show('Could not save: '+(e&&e.message?e.message:e),'err');})
    .submitEntry({logId:f.getAttribute('data-log'),values:values});
  };
})();
</script></body></html>`;
}
