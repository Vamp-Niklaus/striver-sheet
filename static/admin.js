const form = document.getElementById("adminForm");
const stepInput = document.querySelector('input[name="step"]');
const lectureInput = document.querySelector('input[name="lecture"]');
const titleInput = document.querySelector('input[name="title"]');
const idInput = document.querySelector('input[name="id"]');
const submitBtn = document.getElementById("submitBtn");
const deleteBtn = document.getElementById("deleteBtn");
const message = document.getElementById("adminMessage");
const urlList = document.getElementById("urlList");

let allProblems = [];

const naturalSort = (a, b) => {
  if (!a) return -1;
  if (!b) return 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

function populateDatalist(id, items) {
  const dl = document.querySelector(id);
  const uniqueItems = [...new Set(items.map(i => {
    if (!i) return "";
    const s = String(i).trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).filter(Boolean))].sort(naturalSort);
  dl.innerHTML = uniqueItems.map((i) => `<option value="${i}"></option>`).join("");
}

function updateLectures() {
  const selectedStep = stepInput.value;
  const filteredProblems = selectedStep ? allProblems.filter((p) => p.step === selectedStep) : allProblems;
  populateDatalist("#lectures", filteredProblems.map((p) => p.lecture));
}

function updateTitles() {
  const selectedStep = stepInput.value;
  const selectedLecture = lectureInput.value;
  const filteredProblems = allProblems.filter((p) => 
    (!selectedStep || p.step === selectedStep) && 
    (!selectedLecture || p.lecture === selectedLecture)
  );
  populateDatalist("#titles", filteredProblems.map((p) => p.title));
}

function renderUrls(urls) {
  urlList.innerHTML = "";
  urls.forEach(u => addUrlRow(u));
  addUrlRow(""); // Always add one empty row at the bottom
}

function addUrlRow(val) {
  const row = document.createElement("div");
  row.className = "url-row";
  
  const inp = document.createElement("input");
  inp.type = "url";
  inp.className = "url-input";
  inp.value = val;
  inp.placeholder = "https://...";
  
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "remove-url";
  btn.textContent = "✕";
  
  btn.onclick = () => {
    if (urlList.children.length > 1) {
      row.remove();
    } else {
      inp.value = "";
    }
  };
  
  inp.addEventListener("input", () => {
    // If typing in the last input and it's not empty, add a new row
    if (row === urlList.lastElementChild && inp.value.trim() !== "") {
      addUrlRow("");
    }
  });
  
  row.appendChild(inp);
  row.appendChild(btn);
  urlList.appendChild(row);
}

function handleTitleChange() {
  const selectedTitle = titleInput.value.trim();
  const existingProblem = allProblems.find((p) => p.title === selectedTitle);
  
  if (existingProblem) {
    idInput.value = existingProblem.id;
    stepInput.value = existingProblem.step || "";
    lectureInput.value = existingProblem.lecture || "";
    document.querySelector('input[name="difficulty"]').value = existingProblem.difficulty || "";
    document.querySelector('input[name="article"]').value = existingProblem.article || "";
    document.querySelector('input[name="youtube"]').value = existingProblem.youtube || "";
    document.querySelector('textarea[name="notes"]').value = existingProblem.notes || "";
    document.querySelector('input[name="done"]').checked = existingProblem.done || false;
    document.querySelector('input[name="revision"]').checked = existingProblem.revision || false;
    
    const pLinks = existingProblem.practice || {};
    const flatUrls = [
      ...(pLinks.tuf || []),
      ...(pLinks.naukri || []),
      ...(pLinks.leetcode || []),
      ...(pLinks.gfg || []),
      ...(pLinks.other || [])
    ];
    renderUrls(flatUrls);
    
    const author = existingProblem.author || "rakesh";
    const isOwner = author === currentUser || (currentUser === "rakesh" && author === "rakesh");
    
    if (isOwner) {
      submitBtn.textContent = "Update problem";
      submitBtn.disabled = false;
      deleteBtn.style.display = "block";
      message.textContent = "";
    } else {
      submitBtn.textContent = "Read Only (Default Problem)";
      submitBtn.disabled = true;
      deleteBtn.style.display = "none";
      message.textContent = "You cannot edit or delete default problems.";
    }
  } else {
    // If idInput.value is not empty, it means we just transitioned from an existing problem to a new one.
    // In this case, we wipe step and lecture to give a clean slate.
    // Otherwise, we leave them alone so the user can pick step/lecture before typing a title.
    if (idInput.value !== "" || selectedTitle === "") {
      stepInput.value = "";
      lectureInput.value = "";
    }

    idInput.value = "";
    document.querySelector('input[name="difficulty"]').value = "";
    document.querySelector('input[name="article"]').value = "";
    document.querySelector('input[name="youtube"]').value = "";
    document.querySelector('textarea[name="notes"]').value = "";
    
    renderUrls([]);
    
    submitBtn.textContent = "Add problem";
    submitBtn.disabled = false;
    deleteBtn.style.display = "none";
    message.textContent = "";
  }
}

fetch("/api/problems")
  .then((res) => res.json())
  .then((data) => {
    allProblems = data.problems || [];
    populateDatalist("#steps", allProblems.map((p) => p.step));
    populateDatalist("#difficulties", allProblems.map((p) => p.difficulty));
    updateLectures();
    updateTitles();
    renderUrls([]); // initialize empty url box
    
    // Deep linking: Check if ?title= exists in URL
    const urlParams = new URLSearchParams(window.location.search);
    const prefillTitle = urlParams.get("title");
    if (prefillTitle) {
      titleInput.value = prefillTitle;
      handleTitleChange();
    }
  });

stepInput.addEventListener("input", () => {
  updateLectures();
  updateTitles();
});
lectureInput.addEventListener("input", () => {
  updateTitles();
});
titleInput.addEventListener("input", handleTitleChange);

deleteBtn.addEventListener("click", async () => {
  const problemId = idInput.value;
  if (!problemId) return;
  if (!confirm("Are you sure you want to delete this problem?")) return;

  const res = await fetch(`/api/problems/${problemId}`, { method: "DELETE" });
  if (!res.ok) {
    message.textContent = "Could not delete problem.";
    return;
  }
  
  message.textContent = "Deleted problem.";
  allProblems = allProblems.filter((p) => p.id !== problemId);
  form.reset();
  renderUrls([]);
  idInput.value = "";
  submitBtn.textContent = "Add problem";
  deleteBtn.style.display = "none";
  
  setTimeout(() => {
    if (message.textContent === "Deleted problem.") message.textContent = "";
  }, 3000);
  
  populateDatalist("#steps", allProblems.map((p) => p.step));
  populateDatalist("#difficulties", allProblems.map((p) => p.difficulty));
  updateLectures();
  updateTitles();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  
  const allUrls = Array.from(document.querySelectorAll(".url-input"))
    .map((inp) => inp.value.trim())
    .filter((u) => u);
    
  const practice = { tuf: [], naukri: [], leetcode: [], gfg: [], other: [] };
  allUrls.forEach((u) => {
    const lower = u.toLowerCase();
    if (lower.includes('takeuforward.org')) practice.tuf.push(u);
    else if (lower.includes('naukri.com') || lower.includes('codingninjas.com')) practice.naukri.push(u);
    else if (lower.includes('leetcode.com')) practice.leetcode.push(u);
    else if (lower.includes('geeksforgeeks.org')) practice.gfg.push(u);
    else practice.other.push(u);
  });

  const payload = {
    step: data.step,
    lecture: data.lecture,
    title: data.title,
    difficulty: data.difficulty,
    article: data.article,
    youtube: data.youtube,
    notes: data.notes,
    done: form.done.checked,
    revision: form.revision.checked,
    practice: practice
  };

  const problemId = data.id;
  const isUpdate = !!problemId;
  const url = isUpdate ? `/api/problems/${problemId}` : "/api/problems";
  const method = isUpdate ? "PATCH" : "POST";

  const res = await fetch(url, {
    method: method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const result = await res.json();
  if (!res.ok) {
    message.textContent = result.error || "Could not save problem.";
    return;
  }
  
  message.textContent = isUpdate ? `Updated: ${result.title}` : `Added: ${result.title}`;
  
  if (isUpdate) {
    const index = allProblems.findIndex((p) => p.id === problemId);
    if (index !== -1) {
      allProblems[index] = result;
    }
    // Don't reset the form if we just updated an existing problem
    // Instead, just clear the message after 3 seconds
    setTimeout(() => {
      if (message.textContent.startsWith("Updated:")) message.textContent = "";
    }, 3000);
  } else {
    allProblems.push(result);
    
    const currentStep = data.step;
    const currentLecture = data.lecture;
    form.reset();
    renderUrls([]);
    stepInput.value = currentStep;
    lectureInput.value = currentLecture;
    idInput.value = "";
    submitBtn.textContent = "Add problem";
    deleteBtn.style.display = "none";
  }
  
  populateDatalist("#steps", allProblems.map((p) => p.step));
  populateDatalist("#difficulties", allProblems.map((p) => p.difficulty));
  updateLectures();
  updateTitles();
});
