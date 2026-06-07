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

function loadProblem(title) {
  const existingProblem = allProblems.find((p) => p.title.trim() === title.trim());
  
  if (existingProblem) {
    idInput.value = existingProblem.id;
    stepInput.value = existingProblem.step || "";
    lectureInput.value = existingProblem.lecture || "";
    titleInput.value = existingProblem.title || "";
    document.querySelector('select[name="difficulty"]').value = existingProblem.difficulty || "";
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
      submitBtn.textContent = "Save Changes";
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
    message.textContent = "Problem not found.";
    submitBtn.disabled = true;
  }
}

fetch("/api/problems")
  .then((res) => res.json())
  .then((data) => {
    allProblems = data.problems || [];
    renderUrls([]); // initialize empty url box
    
    const urlParams = new URLSearchParams(window.location.search);
    const prefillTitle = urlParams.get("title");
    
    if (prefillTitle) {
      loadProblem(prefillTitle);
    } else {
      message.textContent = "No problem selected to edit.";
      submitBtn.disabled = true;
    }
  });

deleteBtn.addEventListener("click", async () => {
  const problemId = idInput.value;
  if (!problemId) return;
  if (!confirm("Are you sure you want to delete this problem?")) return;

  const res = await fetch(`/api/problems/${problemId}`, { method: "DELETE" });
  if (!res.ok) {
    message.textContent = "Could not delete problem.";
    return;
  }
  
  message.textContent = "Deleted problem. Redirecting...";
  setTimeout(() => window.location.href = "/", 1500);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const problemId = idInput.value;
  if (!problemId) return; // Only allow updates

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

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  const res = await fetch(`/api/problems/${problemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const result = await res.json();
  if (!res.ok) {
    message.textContent = result.error || "Could not save problem.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Changes";
    return;
  }
  
  message.textContent = `Updated: ${result.title}`;
  submitBtn.disabled = false;
  submitBtn.textContent = "Save Changes";
  
  setTimeout(() => {
    if (message.textContent.startsWith("Updated:")) message.textContent = "";
  }, 3000);
});
