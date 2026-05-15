(function(){
  "use strict";

  const FILTER_BY_CLASS = [
    ["kpi-applied", "applied"],
    ["kpi-appointment", "appointment"],
    ["kpi-interview-done", "interview_done"],
    ["kpi-interview", "interview_done"],
    ["kpi-hired", "hired"],
    ["kpi-rate-interview", "heat_interview_gap"],
    ["kpi-rate-hired", "heat_hire_gap"],
    ["kpi-danger", "action"]
  ];

  function $(id){return document.getElementById(id);}

  function val(ids){
    for(const id of ids){
      const el=$(id);
      if(el && typeof el.value !== "undefined" && String(el.value||"").trim()) return String(el.value).trim();
    }
    return "";
  }

  function textOf(card){
    const label=card.querySelector(".label")?.textContent || card.textContent || "";
    return String(label).replace(/\s+/g,"").trim();
  }

  function inferFilter(card){
    const direct=card.dataset.summaryFilter || card.dataset.heatSummaryFilter || "";
    if(direct) return direct;

    for(const [cls,filter] of FILTER_BY_CLASS){
      if(card.classList.contains(cls)) return filter;
    }

    const label=textOf(card);
    if(label.includes("アポ")) return "appointment";
    if(label.includes("面接設定")) return "interview_set";
    if(label.includes("面接実施") || label === "面接") return "interview_done";
    if(label.includes("内定")) return "offer";
    if(label.includes("採用") && !label.includes("応募→採用")) return "hired";
    if(label.includes("応募→面接")) return "heat_interview_gap";
    if(label.includes("応募→採用")) return "heat_hire_gap";
    if(label.includes("辞退")) return "decline";
    if(label.includes("不通")) return "no_contact";
    if(label.includes("要対応")) return "action";
    if(label.includes("放置")) return "dormant";
    if(label.includes("応募")) return "applied";

    return "";
  }

  function listUrl(filter){
    const params=new URLSearchParams();
    params.set("source","dashboard");

    const from=val(["from"]);
    const to=val(["to"]);
    const fy=val(["fy","filterYear"]);
    const division=val(["division","divisionFilter","filterDivision"]);
    const center=val(["center","centerFilter","filterCenter"]);
    const owner=val(["owner","ownerFilter","filterOwner"]);
    const channel=val(["channel","channelFilter","filterChannel"]);
    const job=val(["jobType","job","filterJob"]);

    if(filter) params.set("filter",filter);
    if(from) params.set("from",from);
    if(to) params.set("to",to);
    if(!from && !to && fy) params.set("year",fy);
    if(division) params.set("division",division);
    if(center) params.set("center",center);
    if(owner) params.set("owner",owner);
    if(channel) params.set("channel",channel);
    if(job) params.set("job",job);

    return "./list.html?"+params.toString();
  }

  function activate(card){
    const filter=inferFilter(card);
    if(!filter) return;
    location.href=listUrl(filter);
  }

  function enhance(card){
    const filter=inferFilter(card);
    if(!filter) return;
    card.dataset.summaryFilter=filter;
    card.classList.add("dashboard-link-card");
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    if(!card.getAttribute("aria-label")){
      const label=textOf(card) || "対象";
      card.setAttribute("aria-label",label+"を応募者一覧で確認");
    }
    card.addEventListener("click",()=>activate(card));
    card.addEventListener("keydown",e=>{
      if(e.key==="Enter" || e.key===" "){
        e.preventDefault();
        activate(card);
      }
    });
  }

  function init(){
    document.querySelectorAll(".summary-grid .metric-card").forEach(enhance);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init);
  }else{
    init();
  }
})();
