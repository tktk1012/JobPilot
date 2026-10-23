"use strict";

const STORAGE_KEY = "jobpilot.jobs";
const SETTINGS_KEY = "jobpilot.settings";
const VALID_STATUSES = ["未応募", "応募済み", "返信待ち", "採用", "不採用"];
const VALID_CURRENCIES = ["JPY", "USD", "EUR", "GBP", "AUD", "NZD"];

const form = document.querySelector("#job-form");
const companyInput = document.querySelector("#company");
const roleInput = document.querySelector("#role");
const locationInput = document.querySelector("#location");
const wageInput = document.querySelector("#hourly-wage");
const wageCode = document.querySelector("#wage-code");
const wageCurrencySymbol = document.querySelector("#wage-currency-symbol");
const statusInput = document.querySelector("#status");
const formTitle = document.querySelector("#form-title");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const jobList = document.querySelector("#job-list");
const jobCount = document.querySelector("#job-count");
const emptyState = document.querySelector("#empty-state");
const emptyTitle = document.querySelector("#empty-title");
const emptyDescription = document.querySelector("#empty-description");
const message = document.querySelector("#message");
const searchInput = document.querySelector("#search");
const statusFilter = document.querySelector("#status-filter");
const sortOrder = document.querySelector("#sort-order");
const currencyInput = document.querySelector("#currency");
const jobDescriptionInput = document.querySelector("#job-description");
const analyzeJobButton = document.querySelector("#analyze-job");
const analysisResults = document.querySelector("#analysis-results");
const analysisWage = document.querySelector("#analysis-wage");
const analysisHours = document.querySelector("#analysis-hours");
const analysisLodging = document.querySelector("#analysis-lodging");
const analysisLocation = document.querySelector("#analysis-location");
const analysisWeeklyPay = document.querySelector("#analysis-weekly-pay");
const analysisAfterLodging = document.querySelector("#analysis-after-lodging");

let jobs = [];
let editingJobId = null;
let displayCurrency = "JPY";

function normalizeAnalysisText(text) {
  return text
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[，]/g, ",")
    .replace(/[．]/g, ".");
}

function extractAmount(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(amount)) {
        return amount;
      }
    }
  }
  return null;
}

function extractJobAnalysis(description) {
  const text = normalizeAnalysisText(description);
  const hourlyWage = extractAmount(text, [
    /(?:時給|時間給|1時間あたり)\s*(?:は|：|:|約)?\s*[¥￥]?\s*([\d,]+)\s*円?/i,
    /([\d,]+)\s*円\s*(?:\/|／| per )\s*(?:時|時間)/i,
    /(?:Pay|Hourly\s+rate|Wage)\s*[:：]?\s*(?:NZ\$|NZD\s*)\s*([\d,]+)\s*\/\s*(?:hour|hr)\b/i,
    /(?:NZ\$|NZD\s*)\s*([\d,]+)\s*\/\s*(?:hour|hr)\b/i
  ]);
  let weeklyHours = null;
  const weeklyHoursMatch = text.match(/週(?:あたり|間|に)?\s*([\d.]+)\s*(?:時間|h\b)/i)
    || text.match(/([\d.]+)\s*hours?\s*(?:per|a)\s*week\b/i);
  if (weeklyHoursMatch) {
    weeklyHours = Number(weeklyHoursMatch[1]);
  } else {
    const workDaysMatch = text.match(/週(?:に)?\s*(\d+)\s*日/i);
    const dailyHoursMatch = text.match(/1日(?:あたり)?\s*([\d.]+)\s*時間/i);
    if (workDaysMatch && dailyHoursMatch) {
      weeklyHours = Number(workDaysMatch[1]) * Number(dailyHoursMatch[1]);
    }
  }
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    weeklyHours = null;
  }

  let lodgingCost = null;
  let weeklyLodgingCost = null;
  const lodgingMatch = text.match(/(?:宿泊費|宿泊料金|寮費|滞在費|Accommodation)([^\r\n]{0,35}?)([\d,]+)\s*(?:円|NZ\$|NZD)?/i);
  if (lodgingMatch) {
    lodgingCost = Number(lodgingMatch[2].replace(/,/g, ""));
    const lodgingContext = text.slice(lodgingMatch.index, lodgingMatch.index + lodgingMatch[0].length + 24);
    if (/(?:週あたり|週額|週|週間|\/週|／週|per\s+week|weekly)/i.test(lodgingContext)) {
      weeklyLodgingCost = lodgingCost;
    }
  }
  if (!Number.isFinite(lodgingCost) || lodgingCost < 0) {
    lodgingCost = null;
    weeklyLodgingCost = null;
  }

  const locationMatch = text.match(/(?:勤務地|Location)\s*(?:は|：|:)?\s*([^\r\n。;；]+)/i);
  const location = locationMatch ? locationMatch[1].replace(/[、,]\s*$/, "").trim() : "";

  return {
    hourlyWage,
    weeklyHours,
    lodgingCost,
    weeklyLodgingCost,
    location,
    currency: /(?:NZ\$|NZD)/i.test(text) ? "NZD" : "JPY"
  };
}

function formatAnalysisCurrency(amount, currency) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

function renderJobAnalysis() {
  const result = extractJobAnalysis(jobDescriptionInput.value);
  const weeklyPay = result.hourlyWage !== null && result.weeklyHours !== null
    ? result.hourlyWage * result.weeklyHours
    : null;

  analysisWage.textContent = result.hourlyWage === null ? "不明" : `${formatAnalysisCurrency(result.hourlyWage, result.currency)} / 時`;
  analysisHours.textContent = result.weeklyHours === null ? "不明" : `${result.weeklyHours}時間`;
  analysisLodging.textContent = result.lodgingCost === null
    ? "不明"
    : `${formatAnalysisCurrency(result.lodgingCost, result.currency)}${result.weeklyLodgingCost === null ? "（期間不明）" : " / 週"}`;
  analysisLocation.textContent = result.location || "不明";
  analysisWeeklyPay.textContent = weeklyPay === null ? "不明" : formatAnalysisCurrency(weeklyPay, result.currency);
  analysisAfterLodging.textContent = weeklyPay === null || result.weeklyLodgingCost === null
    ? "不明"
    : formatAnalysisCurrency(weeklyPay - result.weeklyLodgingCost, result.currency);
  analysisResults.hidden = false;
}

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = type === "success" ? "message success" : "message";
  message.hidden = false;
}

function clearMessage() {
  message.textContent = "";
  message.hidden = true;
  message.className = "message";
}

function isJob(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.company === "string"
    && typeof value.role === "string"
    && typeof value.location === "string"
    && Number.isFinite(value.hourlyWage)
    && VALID_STATUSES.includes(value.status);
}

function loadJobs() {
  try {
    const savedJobs = localStorage.getItem(STORAGE_KEY);
    if (savedJobs === null) {
      return [];
    }

    const parsedJobs = JSON.parse(savedJobs);
    if (!Array.isArray(parsedJobs) || !parsedJobs.every(isJob)) {
      throw new Error("保存データの形式が正しくありません。");
    }
    return parsedJobs;
  } catch (error) {
    showMessage(`保存した求人を読み込めませんでした。データを確認してください。(${error.message})`);
    return [];
  }
}

function saveJobs(nextJobs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextJobs));
    jobs = nextJobs;
    return true;
  } catch (error) {
    showMessage(`データを保存できませんでした。ブラウザの設定や空き容量をご確認ください。(${error.message})`);
    return false;
  }
}

function loadSettings() {
  try {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings === null) {
      return;
    }

    const parsedSettings = JSON.parse(savedSettings);
    if (parsedSettings === null || typeof parsedSettings !== "object") {
      throw new Error("設定データの形式が正しくありません。");
    }
    if (!VALID_CURRENCIES.includes(parsedSettings.currency)) {
      throw new Error("通貨設定が正しくありません。");
    }
    displayCurrency = parsedSettings.currency;
  } catch (error) {
    showMessage(`表示設定を読み込めませんでした。(${error.message})`);
  }
}

function updateCurrencyDisplay() {
  wageCode.textContent = displayCurrency;
  const currencyPart = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: displayCurrency
  }).formatToParts(0).find((part) => part.type === "currency");
  wageCurrencySymbol.textContent = currencyPart ? currencyPart.value : displayCurrency;
  renderJobs();
}

function statusClass(status) {
  const classes = {
    "応募済み": "status-applied",
    "返信待ち": "status-waiting",
    "採用": "status-hired",
    "不採用": "status-rejected"
  };
  return classes[status] || "";
}

function createDetail(icon, text) {
  const detail = document.createElement("span");
  detail.className = "job-detail";
  const iconElement = document.createElement("span");
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;
  detail.append(iconElement, document.createTextNode(text));
  return detail;
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";

  const main = document.createElement("div");
  main.className = "job-main";
  const titleRow = document.createElement("div");
  titleRow.className = "job-title-row";

  const title = document.createElement("h3");
  title.className = "job-title";
  title.textContent = job.role;

  const badge = document.createElement("span");
  badge.className = `status-badge ${statusClass(job.status)}`;
  badge.textContent = job.status;
  titleRow.append(title, badge);

  const company = document.createElement("p");
  company.className = "job-company";
  company.textContent = job.company;

  const details = document.createElement("div");
  details.className = "job-details";
  if (job.location) {
    details.append(createDetail("⌖", job.location));
  }
  const formattedWage = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: displayCurrency,
    maximumFractionDigits: 2
  }).format(job.hourlyWage);
  details.append(createDetail(" ", `${formattedWage} / 時`));
  main.append(titleRow, company, details);

  const actions = document.createElement("div");
  actions.className = "job-actions";

  const editButton = document.createElement("button");
  editButton.className = "card-action";
  editButton.type = "button";
  editButton.textContent = "編集";
  editButton.setAttribute("aria-label", `${job.company}の求人を編集`);
  editButton.addEventListener("click", () => startEditing(job));

  const deleteButton = document.createElement("button");
  deleteButton.className = "card-action delete";
  deleteButton.type = "button";
  deleteButton.textContent = "削除";
  deleteButton.setAttribute("aria-label", `${job.company}の求人を削除`);
  deleteButton.addEventListener("click", () => deleteJob(job));
  actions.append(editButton, deleteButton);

  card.append(main, actions);
  return card;
}

function renderJobs() {
  const query = searchInput.value.trim().toLocaleLowerCase("ja");
  const selectedStatus = statusFilter.value;
  const filteredJobs = jobs.filter((job) => {
    const matchesQuery = !query
      || job.company.toLocaleLowerCase("ja").includes(query)
      || job.role.toLocaleLowerCase("ja").includes(query);
    return matchesQuery && (!selectedStatus || job.status === selectedStatus);
  });

  if (sortOrder.value === "high-to-low") {
    filteredJobs.sort((first, second) => second.hourlyWage - first.hourlyWage);
  } else if (sortOrder.value === "low-to-high") {
    filteredJobs.sort((first, second) => first.hourlyWage - second.hourlyWage);
  }

  jobList.replaceChildren(...filteredJobs.map(createJobCard));
  const hasFilters = Boolean(query || selectedStatus);
  jobCount.textContent = hasFilters
    ? `${filteredJobs.length}件 / 全${jobs.length}件`
    : `${jobs.length}件`;
  emptyState.hidden = filteredJobs.length > 0;
  if (jobs.length === 0) {
    emptyTitle.textContent = "求人はまだありません";
    emptyDescription.textContent = "上のフォームから、最初の求人を登録してみましょう。";
  } else {
    emptyTitle.textContent = "条件に合う求人がありません";
    emptyDescription.textContent = "検索キーワードや応募状況を変更してみてください。";
  }
}

function resetForm() {
  form.reset();
  editingJobId = null;
  formTitle.textContent = "求人を登録する";
  submitButton.innerHTML = '<span aria-hidden="true">＋</span> 求人を登録';
  cancelEditButton.hidden = true;
}

function startEditing(job) {
  clearMessage();
  editingJobId = job.id;
  companyInput.value = job.company;
  roleInput.value = job.role;
  locationInput.value = job.location;
  wageInput.value = String(job.hourlyWage);
  statusInput.value = job.status;
  formTitle.textContent = "求人を編集する";
  submitButton.textContent = "変更を保存";
  cancelEditButton.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  companyInput.focus({ preventScroll: true });
}

function deleteJob(job) {
  const shouldDelete = window.confirm(`「${job.company}」の求人を削除しますか？`);
  if (!shouldDelete) {
    return;
  }
  const nextJobs = jobs.filter((savedJob) => savedJob.id !== job.id);
  if (saveJobs(nextJobs)) {
    if (editingJobId === job.id) {
      resetForm();
    }
    renderJobs();
    showMessage("求人を削除しました。", "success");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage();

  const hourlyWage = Number(wageInput.value);
  if (!Number.isFinite(hourlyWage) || hourlyWage < 0) {
    showMessage("時給は0以上の数値で入力してください。");
    wageInput.focus();
    return;
  }

  const jobDetails = {
    company: companyInput.value.trim(),
    role: roleInput.value.trim(),
    location: locationInput.value.trim(),
    hourlyWage,
    status: statusInput.value
  };

  if (!jobDetails.company || !jobDetails.role || !VALID_STATUSES.includes(jobDetails.status)) {
    showMessage("会社名と職種を入力し、有効な応募状況を選択してください。");
    return;
  }

  const nextJobs = editingJobId
    ? jobs.map((job) => (job.id === editingJobId ? { ...job, ...jobDetails } : job))
    : [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...jobDetails }, ...jobs];

  if (saveJobs(nextJobs)) {
    const wasEditing = editingJobId !== null;
    resetForm();
    renderJobs();
    showMessage(wasEditing ? "求人を更新しました。" : "求人を登録しました。", "success");
  }
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  clearMessage();
});

analyzeJobButton.addEventListener("click", renderJobAnalysis);

searchInput.addEventListener("input", renderJobs);
statusFilter.addEventListener("change", renderJobs);
sortOrder.addEventListener("change", renderJobs);
currencyInput.addEventListener("change", () => {
  displayCurrency = currencyInput.value;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ currency: displayCurrency }));
  } catch (error) {
    showMessage(`通貨設定を保存できませんでした。(${error.message})`);
  }
  updateCurrencyDisplay();
});

jobs = loadJobs();
loadSettings();
currencyInput.value = displayCurrency;
updateCurrencyDisplay();
