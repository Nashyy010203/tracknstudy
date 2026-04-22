// ===== STORAGE (TOP PART NG FILE) =====

// Assignment storage
function getAssignments() {
  return JSON.parse(localStorage.getItem("assignments")) || [];
}

function saveAssignments(assignments) {
  localStorage.setItem("assignments", JSON.stringify(assignments));
}

// Task storage
function getTasks() {
  return JSON.parse(localStorage.getItem("tasks")) || [];
}

function saveTasks(tasks) {
  localStorage.setItem("tasks", JSON.stringify(tasks));
}

// ===== MCQ GENERATION (JavaScript-based) =====

// Generate MCQ from text - looks for existing question/choice patterns
function generateMCQFromText(text) {
  const questions = [];
  
  // Split into lines
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for numbered question (e.g., "1. What is..." or "1) What is...")
    if (/^\d+[\.\)]\s*/.test(line)) {
      const questionText = line.replace(/^\d+[\.\)]\s*/, '').trim();
      const choices = [];
      let j = i + 1;
      
      // Look for choices (A., A), etc.)
      while (j < lines.length && choices.length < 4) {
        const nextLine = lines[j];
        if (/^[A-Da-d][\.\)]\s*/.test(nextLine)) {
          const choice = nextLine.replace(/^[A-Da-d][\.\)]\s*/, '').trim();
          if (choice && choice.length < 100) {
            choices.push(choice);
          }
          j++;
        } else if (/^\d+[\.\)]/.test(nextLine)) {
          break; // Next question
        } else if (nextLine.length < 2) {
          j++;
        } else {
          break;
        }
      }
      
      if (choices.length >= 2) {
        questions.push({
          q: questionText,
          a: choices[0],
          options: choices
        });
        i = j - 1;
      }
    }
  }
  
  return questions;
}

// Extract noun phrases from text for use as distractors
function extractNounPhrasesFromText(text) {
  const phrases = [];
  const stopWords = new Set(['that', 'with', 'from', 'this', 'they', 'their', 'there', 'these', 'those',
    'which', 'what', 'where', 'when', 'been', 'have', 'will', 'does', 'also', 'into', 'over',
    'such', 'than', 'then', 'them', 'only', 'other', 'about', 'could', 'after', 'before',
    'between', 'through', 'because', 'while', 'being', 'having', 'doing', 'each', 'every']);
  
  const capWords = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  const skipCaps = ['The', 'This', 'That', 'These', 'Those', 'A', 'An', 'It', 'Its', 'In', 'On', 'At', 'By', 'For', 'To', 'And', 'But', 'Or', 'Not', 'As', 'If', 'So', 'Up'];
  for (const w of capWords) {
    if (!skipCaps.includes(w) && !phrases.includes(w)) phrases.push(w);
  }
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  for (const w of words) {
    if (!stopWords.has(w) && !phrases.includes(w)) phrases.push(w);
  }
  return phrases;
}

// Extract predicates from sentences for distractors
function extractPredicatesFromSentences(sentences) {
  const predicates = [];
  const patterns = [
    /(?:is|are|was|were)\s+(?:a|an|the)?\s*([^.!?]+)/i,
    /(?:has|have|had)\s+([^.!?]+)/i,
    /(?:is|are|was|were)\s+known\s+for\s+([^.!?]+)/i,
    /(?:is|are|was|were)\s+(?:called|named)\s+([^.!?]+)/i,
    /(?:contains)\s+([^.!?]+)/i
  ];
  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match && match[1]) {
        const pred = match[1].trim().replace(/[.,;:]$/, '');
        if (pred.length > 3 && pred.length < 80 && !predicates.includes(pred)) {
          predicates.push(pred);
        }
      }
    }
  }
  return predicates;
}

// Generate near-miss distractors by modifying the correct answer
function generateNearMissDistractors(correctAnswer) {
  const misses = [];
  const replacements = {
    'largest': 'smallest', 'smallest': 'largest',
    'hottest': 'coldest', 'coldest': 'hottest',
    'closest': 'farthest', 'farthest': 'closest',
    'fastest': 'slowest', 'slowest': 'fastest',
    'first': 'last', 'last': 'first',
    'highest': 'lowest', 'lowest': 'highest',
    'oldest': 'newest', 'newest': 'oldest',
    'only': 'one of many', 'unique': 'common',
    'massive': 'tiny', 'famous': 'unknown',
    'protective': 'harmful', 'liquid': 'solid',
    'solid': 'liquid', 'thick': 'thin', 'thin': 'thick',
    'ice': 'rock', 'rock': 'ice'
  };
  const lowerAnswer = correctAnswer.toLowerCase();
  for (const [from, to] of Object.entries(replacements)) {
    if (lowerAnswer.includes(from)) {
      const modified = correctAnswer.replace(new RegExp(from, 'gi'), to);
      if (modified !== correctAnswer) misses.push(modified);
    }
  }
  const numMatch = correctAnswer.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (numMatch) {
    const num = parseFloat(numMatch[1]);
    const unit = numMatch[2].trim();
    for (const v of [num + 1, num - 1, num * 2, Math.round(num / 2), num + 10, num - 10]) {
      if (v > 0) {
        const candidate = unit ? `${v} ${unit}` : `${v}`;
        if (candidate !== correctAnswer && !misses.includes(candidate)) misses.push(candidate);
      }
      if (misses.length >= 4) break;
    }
  }
  const words = correctAnswer.split(/\s+/);
  if (words.length >= 3) {
    const removed = [...words];
    removed.splice(Math.floor(words.length / 2), 1);
    misses.push(removed.join(' '));
  }
  return misses;
}

// Generate MCQ from sentences when no structured format found - context-aware
function generateMCQFromSentences(sentences) {
  const questions = [];
  const fullText = sentences.join(' ');
  const allNouns = extractNounPhrasesFromText(fullText);
  const allPredicates = extractPredicatesFromSentences(sentences);
  const usedSubjects = new Set();
  
  const maxQuestions = Math.min(sentences.length, 20);
  
  for (let i = 0; i < maxQuestions; i++) {
    const sentence = sentences[i].trim();
    if (sentence.length < 10) continue;
    
    const words = sentence.split(/\s+/);
    if (words.length < 3) continue;
    
    let question = "";
    let answer = "";
    let subject = "";
    
    const patterns = [
      { regex: /The\s+(\w+(?:\s+\w+)?)\s+(?:is|was|are|were)\s+(?:a|an|the)?\s*([^.]+)/i, type: "the" },
      { regex: /(\w+)\s+(?:is|was|are|were)\s+(?:a|an|the)?\s*([^.]+)/i, type: "simple" },
      { regex: /(\w+)\s+is\s+known\s+for\s+([^.]+)/i, type: "known" },
      { regex: /(\w+)\s+has\s+([^.]+)/i, type: "has" },
      { regex: /(\w+)\s+contains\s+([^.]+)/i, type: "contains" },
      { regex: /(\w+)\s+is\s+(?:called|known\s+as)\s+([^.]+)/i, type: "called" }
    ];
    
    for (const pattern of patterns) {
      const match = sentence.match(pattern.regex);
      if (match && match[1] && match[2]) {
        subject = match[1].trim();
        const description = match[2].trim();
        
        if (subject.length < 3 || usedSubjects.has(subject.toLowerCase())) continue;
        
        switch (pattern.type) {
          case "the":
          case "simple":
            question = `What is ${subject}?`;
            answer = description;
            break;
          case "known":
            question = `What is ${subject} known for?`;
            answer = description;
            break;
          case "has":
            question = `What does ${subject} have?`;
            answer = description;
            break;
          case "contains":
            question = `What does ${subject} contain?`;
            answer = description;
            break;
          case "called":
            question = `What is ${subject} called?`;
            answer = description;
            break;
        }
        
        if (question && answer) break;
      }
    }
    
    if (!question || !answer) {
      const factMatch = sentence.match(/(?:in|on|at|by|with|for)\s+([^.]+)/i);
      if (factMatch && factMatch[1].length > 5) {
        subject = words[0] || "this";
        answer = factMatch[1].trim();
        question = `What happens ${subject}?`;
      } else {
        continue;
      }
    }
    
    if (answer.length < 3 || answer.length > 80) continue;
    
    usedSubjects.add(subject.toLowerCase());
    
    // Build context-aware options
    const options = [answer];
    
    // Strategy 1: Other predicates from the text
    const otherPredicates = allPredicates
      .filter(p => p.toLowerCase() !== answer.toLowerCase() && p.length > 3)
      .sort(() => Math.random() - 0.5);
    for (const pred of otherPredicates) {
      if (options.length >= 4) break;
      if (!options.includes(pred)) options.push(pred);
    }
    
    // Strategy 2: Near-miss distractors
    if (options.length < 4) {
      const nearMisses = generateNearMissDistractors(answer).sort(() => Math.random() - 0.5);
      for (const miss of nearMisses) {
        if (options.length >= 4) break;
        if (!options.includes(miss)) options.push(miss);
      }
    }
    
    // Strategy 3: Nouns from the text
    if (options.length < 4) {
      const shuffledNouns = allNouns.sort(() => Math.random() - 0.5);
      for (const noun of shuffledNouns) {
        if (options.length >= 4) break;
        if (!options.includes(noun) && noun.toLowerCase() !== answer.toLowerCase()) options.push(noun);
      }
    }
    
    // Strategy 4: Context-based fillers (only if really needed)
    if (options.length < 4) {
      const fillers = [
        `A different property of ${subject}`,
        `Not mentioned about ${subject}`,
        `An unrelated characteristic`,
        `Cannot be determined from the text`
      ];
      for (const f of fillers) {
        if (options.length >= 4) break;
        if (!options.includes(f)) options.push(f);
      }
    }
    
    const shuffledOptions = options.slice(0, 4).sort(() => Math.random() - 0.5);
    
    questions.push({
      q: question,
      a: answer,
      options: shuffledOptions
    });
  }
  
  return questions;
}





//  Profile + Avatar
function toggleProfilePanel() {
  const dropdown = document.getElementById('profileDropdown');
  dropdown.classList.toggle('open');
}

// Mobile Navigation Toggle
function toggleMobileMenu() {
  const navMenu = document.getElementById('navMenu');
  const hamburger = document.querySelector('.hamburger-menu');
  navMenu.classList.toggle('active');
  hamburger.classList.toggle('active');
}

// Close mobile menu on link click
function closeMobileMenuOnClick() {
  const navMenu = document.getElementById('navMenu');
  const hamburger = document.querySelector('.hamburger-menu');
  navMenu.classList.remove('active');
  hamburger.classList.remove('active');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
  const navMenu = document.getElementById('navMenu');
  const hamburger = document.querySelector('.hamburger-menu');
  
  if (navMenu && hamburger) {
    if (!navMenu.contains(event.target) && !hamburger.contains(event.target)) {
      navMenu.classList.remove('active');
      hamburger.classList.remove('active');
    }
  }
});

function toggleCustomizationPanel() {
  const panel = document.getElementById('customizationPanel');
  panel.classList.toggle('open');
  document.getElementById('profileDropdown').classList.remove('open');
}

function toggleThemeDropdown() {
  const dropdown = document.getElementById('themeDropdown');
  dropdown.classList.toggle('open');
}

// Close customization panel when clicking outside
document.addEventListener('click', function(event) {
  const panel = document.getElementById('customizationPanel');
  const dropdown = document.getElementById('profileDropdown');
  if (!panel.contains(event.target) && !dropdown.contains(event.target)) {
    panel.classList.remove('open');
  }
});

function setHeaderBackground(color) {
  const header = document.querySelector('.site-header');
  const body = document.body;
  
  body.classList.remove('cyber', 'chill', 'chill-vibes', 'sakura', 'Earth', 'Mist', 'Sand');
  
  header.style.backgroundColor = color;
  const brightness = getBrightness(color);
  const textColor = brightness > 128 ? '#000' : '#fff';
  header.style.color = textColor;
  const navLinks = header.querySelectorAll('a');
  navLinks.forEach(a => a.style.color = textColor);
  const logo = header.querySelector('.logo');
  if (logo) logo.style.color = textColor;
  
  applyCardContrast();
  
  localStorage.setItem('headerBgColor', color);
  localStorage.setItem('headerColor', color);
}

function setHomepageBackground(color) {
  const body = document.body;
  const dashboard = document.querySelector('.dashboard');
  
  body.classList.remove('cyber', 'chill', 'chill-vibes', 'sakura', 'Earth', 'Mist', 'Sand');
  
  body.style.backgroundColor = color;
  if (dashboard) {
    dashboard.style.backgroundColor = 'transparent';
  }
  const brightness = getBrightness(color);
  body.style.color = brightness > 128 ? '#1e293b' : '#f0f0f0';
  
  applyCardContrast();
  
  localStorage.setItem('homepageBgColor', color);
  localStorage.setItem('bgColor', color);
}

function getBrightness(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return (r*299 + g*587 + b*114) / 1000;
}

function applyCardContrast() {
  const bgColor = document.body.style.backgroundColor || getComputedStyle(document.body).backgroundColor;
  const headerColor = document.querySelector('.site-header').style.backgroundColor || getComputedStyle(document.querySelector('.site-header')).backgroundColor;
  
  let bgBrightness = 128;
  if (bgColor && bgColor !== 'transparent' && bgColor.startsWith('rgb')) {
    const match = bgColor.match(/\d+/g);
    if (match && match.length >= 3) {
      bgBrightness = (parseInt(match[0]) * 299 + parseInt(match[1]) * 587 + parseInt(match[2]) * 114) / 1000;
    }
  }
  
  const isDarkBg = bgBrightness < 128;
  const modules = document.querySelectorAll('.module');
  const shortcuts = document.querySelectorAll('.shortcut-btn');
  const sections = document.querySelectorAll('.section');
  const toolGrid = document.querySelectorAll('.tool-grid .module');
  
  modules.forEach(mod => {
    if (isDarkBg) {
      mod.style.background = 'rgba(255,255,255,0.1)';
      mod.style.borderColor = 'rgba(255,255,255,0.2)';
      mod.style.color = '#f0f0f0';
    } else {
      mod.style.background = 'rgba(255,255,255,0.9)';
      mod.style.borderColor = 'rgba(0,0,0,0.1)';
      mod.style.color = '#1e293b';
    }
  });
  
  shortcuts.forEach(btn => {
    btn.style.background = isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)';
    btn.style.color = isDarkBg ? '#fff' : '#1e293b';
    btn.style.borderColor = isDarkBg ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)';
  });
  
  sections.forEach(sec => {
    if (isDarkBg) {
      sec.style.background = 'rgba(255,255,255,0.1)';
      sec.style.borderColor = 'rgba(255,255,255,0.2)';
      sec.style.color = '#fff';
    } else {
      sec.style.background = 'rgba(255,255,255,0.9)';
      sec.style.borderColor = 'rgba(0,0,0,0.1)';
      sec.style.color = '#1e293b';
    }
  });
  
  toolGrid.forEach(mod => {
    if (isDarkBg) {
      mod.style.background = 'rgba(255,255,255,0.1)';
      mod.style.borderColor = 'rgba(255,255,255,0.2)';
      mod.style.color = '#f0f0f0';
    } else {
      mod.style.background = 'rgba(255,255,255,0.9)';
      mod.style.borderColor = 'rgba(0,0,0,0.1)';
      mod.style.color = '#1e293b';
    }
  });
}

function saveTheme() {
  const bgColor = document.body.style.backgroundColor;
  const headerColor = document.querySelector('.site-header').style.backgroundColor;
  
  if (bgColor) {
    localStorage.setItem('bgColor', bgColor);
    localStorage.setItem('homepageBgColor', bgColor);
  }
  if (headerColor) {
    localStorage.setItem('headerColor', headerColor);
    localStorage.setItem('headerBgColor', headerColor);
  }
}

function loadTheme() {
  const savedBgColor = localStorage.getItem('bgColor') || localStorage.getItem('homepageBgColor');
  const savedHeaderColor = localStorage.getItem('headerColor') || localStorage.getItem('headerBgColor');
  const savedTheme = localStorage.getItem('selectedTheme');
  
  if (savedTheme && savedTheme !== 'custom') {
    document.body.style.backgroundColor = '';
    document.body.style.background = '';
    const dashboard = document.querySelector('.dashboard');
    if (dashboard) dashboard.style.backgroundColor = 'transparent';
    const header = document.querySelector('.site-header');
    if (header) header.style.backgroundColor = '';
    
    setTheme(savedTheme);
    return;
  }
  
  document.body.classList.remove('chill', 'cyber', 'chill-vibes', 'sakura', 'Earth', 'Mist', 'Sand');
  
  if (savedHeaderColor) {
    setHeaderBackground(savedHeaderColor);
    const picker = document.getElementById('headerBgColorPicker');
    if (picker) picker.value = savedHeaderColor;
  }
  
  if (savedBgColor) {
    setHomepageBackground(savedBgColor);
    const picker = document.getElementById('homepageBgColorPicker');
    if (picker) picker.value = savedBgColor;
  }
}

function setTheme(theme) {
  const body = document.body;
  const dashboard = document.querySelector('.dashboard');
  const header = document.querySelector('.site-header');

  const isUnlocked = localStorage.getItem("themesUnlocked") === "true";

if (theme !== 'cyber' && !isUnlocked) {
  return;
}
   
  const themeMap = {
    'cyber': 'cyber',
    'chill-vibes': 'chill-vibes',
    'chill': 'chill',
    'sakura': 'sakura',
    'Earth': 'Earth',
    'Mist': 'Mist',
    'Sand': 'Sand'
  };
   
  const validTheme = themeMap[theme] || 'chill';
   
  body.classList.remove('chill', 'cyber', 'chill-vibes', 'sakura', 'Earth', 'Mist', 'Sand');
   
  body.style.backgroundColor = '';
  body.style.background = '';
  if (dashboard) {
    dashboard.style.backgroundColor = 'transparent';
  }
  if (header) {
    header.style.backgroundColor = '';
  }
   
  body.classList.add(validTheme);
   
  localStorage.setItem('selectedTheme', validTheme);
  
  setTimeout(() => {
    applyCardContrast();
  }, 100);
}

function resetCustomizations() {
  localStorage.removeItem('bgColor');
  localStorage.removeItem('headerColor');
  localStorage.removeItem('homepageBgColor');
  localStorage.removeItem('headerBgColor');
  localStorage.removeItem('selectedTheme');
  
  setTheme('chill');
  document.getElementById('headerBgColorPicker').value = '#008080';
  document.getElementById('homepageBgColorPicker').value = '#ffffff';
  
  applyCardContrast();
}

// Close profile dropdown when clicking outside
document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('profileDropdown');
  const userAvatar = document.getElementById('userAvatar');

  if (!dropdown.contains(event.target) && !userAvatar.contains(event.target)) {
    dropdown.classList.remove('open');
  }
});

// 🔔 Notification System
let notifications = [];
let notificationId = 0;
let deletedNotifications = [];

// SAVE to localStorage
function saveNotifications() {
  localStorage.setItem("notifications", JSON.stringify(notifications));
  localStorage.setItem("deletedNotifications", JSON.stringify(deletedNotifications));
}

function loadNotifications() {
  notifications = JSON.parse(localStorage.getItem("notifications")) || [];
  deletedNotifications = JSON.parse(localStorage.getItem("deletedNotifications")) || [];

  // para hindi mag duplicate ID
  notificationId = notifications.length > 0 
    ? Math.max(...notifications.map(n => n.id)) 
    : 0;

  renderNotifications();
  updateNotificationBadge();
}

function addNotification(message) {
  const notification = {
    id: ++notificationId,
    message: message,
    timestamp: new Date(),
    read: false
  };
  notifications.push(notification);
  updateNotificationBadge();
  renderNotifications();
  saveNotifications();
}

function updateNotificationBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notificationBadge');
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotifications() {
  const list = document.getElementById('notificationList');
  list.innerHTML = '';
  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notification-item' + (n.read ? ' read' : '');
    item.innerHTML = `
      <div class="notification-message">${n.message}</div>
      <div class="notification-timestamp">${new Date(n.timestamp).toLocaleTimeString()}</div>
      <button class="delete-notification" onclick="deleteNotification(${n.id})">🗑️</button>
    `;
    list.appendChild(item);
  });
}

function toggleNotificationDropdown() {
  const dropdown = document.getElementById('notificationDropdown');
  dropdown.classList.toggle('open');
}

function markAsRead() {
  notifications.forEach(n => n.read = true);
  updateNotificationBadge();
  renderNotifications();
}

function deleteNotification(id) {
  const notif = notifications.find(n => n.id === id);

  if (notif) {
    deletedNotifications.push(notif);
  }

  notifications = notifications.filter(n => n.id !== id);
  updateNotificationBadge();
  renderNotifications();
  saveNotifications();
}

function deleteAll() {
  showConfirm("Are you sure you want to delete all notifications?", () => {

    // ilipat lang sa history (optional kung meron ka)
    deletedNotifications.push(...notifications);

    // clear current notifications array
    notifications = [];

    // SAVE (eto importante)
    saveNotifications();

    // UI update
    updateNotificationBadge();
    renderNotifications();

  });
}

function showConfirm(message, onOk) {
  const modal = document.getElementById("confirmModal");
  const msg = document.getElementById("confirmMessage");
  const okBtn = document.getElementById("confirmOk");
  const cancelBtn = document.getElementById("confirmCancel");

  msg.textContent = message;
  modal.classList.add("show");

  okBtn.onclick = () => {
    modal.classList.remove("show");
    onOk();
  };

  cancelBtn.onclick = () => {
    modal.classList.remove("show");
  };
}

function showHistory() {
  const list = document.getElementById('notificationList');
  list.innerHTML = '';

  if (deletedNotifications.length === 0) {
    list.innerHTML = '<p>No history yet.</p>';
    return;
  }

  deletedNotifications.forEach((n, index) => {
    const item = document.createElement('div');
    item.className = 'notification-item read';
    item.innerHTML = `
      <div class="notification-message">${n.message}</div>
      <div class="notification-timestamp">${new Date(n.timestamp).toLocaleTimeString()}</div>
      <button onclick="deleteHistoryItem(${index})">❌</button>
    `;
    list.appendChild(item);
  });

  const clearBtn = document.createElement('button');
  clearBtn.textContent = "Clear History";
  clearBtn.onclick = clearHistory;
  list.appendChild(clearBtn);
}

function deleteHistoryItem(index) {
  deletedNotifications.splice(index, 1);
  saveNotifications();
  showHistory();
}

function clearHistory() {
  const confirmClear = confirm("Delete all history?");
  
  if (confirmClear) {
    deletedNotifications = [];
    saveNotifications();
    showHistory();
  }
}

// Close notification dropdown when clicking outside
document.addEventListener('click', function(event) {
  const dropdown = document.getElementById('notificationDropdown');
  const bell = document.querySelector('.notification-bell');
  if (dropdown && bell && !dropdown.contains(event.target) && !bell.contains(event.target)) {
    dropdown.classList.remove('open');
  }
});

//dito langggggggggggggggggggggggggggggggggggg

function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("userAvatar").src = e.target.result;
    localStorage.setItem("customAvatar", e.target.result);
  };
  reader.readAsDataURL(file);
}

document.getElementById("userName").oninput = (e) => {
  localStorage.setItem("userName", e.target.value);
};


// ⏱️ Study Timer with Presets and Progress Ring
let timerInterval;
let remainingTime = 0;
let totalTime = 0;
let isBreak = false;
let currentPreset = null;
let sessionLog = [];

const motivationalQuotes = [
  "Every second counts when you're building something great.",
  "Focus on progress, not perfection.",
  "Small steps lead to big achievements.",
  "Your future self will thank you.",
  "Stay consistent, stay amazing.",
  "One session at a time.",
  "You've got this! Keep going.",
  "Breakthroughs happen outside comfort zones."
];

function setPreset(preset) {
  currentPreset = preset;
  let workTime, breakTime;

  switch(preset) {
    case 'pomodoro':
      workTime = 25;
      breakTime = 5;
      break;
    case 'deep':
      workTime = 50;
      breakTime = 10;
      break;
    case 'chill':
      workTime = 15;
      breakTime = 5;
      break;
  }

  if (!isBreak) {
    remainingTime = workTime * 60;
    totalTime = workTime * 60;
    document.getElementById('timerMode').textContent = 'Work Session';
  } else {
    remainingTime = breakTime * 60;
    totalTime = breakTime * 60;
    document.getElementById('timerMode').textContent = 'Break Time';
  }

  updateTimerDisplay();
  updateProgressRing();
}

function setCustomTimer() {
  const customMinutes = parseInt(document.getElementById('customMinutes').value);
  if (customMinutes && customMinutes > 0 && customMinutes <= 180) {
    currentPreset = null; // Clear preset when using custom
    remainingTime = customMinutes * 60;
    totalTime = customMinutes * 60;
    document.getElementById('timerMode').textContent = 'Custom Session';
    updateTimerDisplay();
    updateProgressRing();
  } else {
    alert('Please enter a valid time between 1-180 minutes.');
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;
  document.getElementById("timerDisplay").textContent =
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateProgressRing() {
  const progress = ((totalTime - remainingTime) / totalTime) * 339.3;
  document.getElementById('timerProgress').style.strokeDashoffset = 339.3 - progress;
}

function startTimer() {
  if (remainingTime <= 0 && !currentPreset) {
    alert("Please select a preset or set custom time.");
    return;
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (remainingTime > 0) {
      remainingTime--;
      updateTimerDisplay();
      updateProgressRing();
    } else {
      clearInterval(timerInterval);
      logSession();
      showMotivationalQuote();

      if (currentPreset && !isBreak) {
        // Start break
        isBreak = true;
        setPreset(currentPreset);
        startTimer();
      } else {
        // Session complete
        isBreak = false;
        currentPreset = null;
        document.getElementById('timerMode').textContent = 'Session Complete!';
        alert("🎉 Session complete! Great work!");
      }
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
}

function resetTimer() {
  clearInterval(timerInterval);
  remainingTime = 0;
  totalTime = 0;
  isBreak = false;
  currentPreset = null;
  updateTimerDisplay();
  updateProgressRing();
  document.getElementById('timerMode').textContent = 'Ready';
}

function logSession() {
  const now = new Date();
  const sessionType = isBreak ? 'Break' : 'Work';
  const duration = Math.floor(totalTime / 60);
  const logEntry = {
    timestamp: now.toISOString(),
    type: sessionType,
    duration: duration,
    display: `${now.toLocaleTimeString()} - ${sessionType} (${duration}min)`
  };

  sessionLog.push(logEntry);
  if (sessionLog.length > 10) sessionLog.shift(); // Keep only last 10 sessions

  updateSessionLog();
  saveSessionLog(); // Save to localStorage
}

function updateSessionLog() {
  const sessionList = document.getElementById('sessionList');
  sessionList.innerHTML = '';
  sessionLog.forEach(session => {
    const li = document.createElement('li');
    li.textContent = session.display;
    li.title = `Completed at ${new Date(session.timestamp).toLocaleString()}`;
    sessionList.appendChild(li);
  });
}

function saveSessionLog() {
  localStorage.setItem('sessionLog', JSON.stringify(sessionLog));
}

function loadSessionLog() {
  const saved = localStorage.getItem('sessionLog');
  if (saved) {
    sessionLog = JSON.parse(saved);
    updateSessionLog();
  }
}

function showMotivationalQuote() {
  const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  const quoteElement = document.getElementById('motivationalQuote');
  quoteElement.textContent = randomQuote;

  // Add a badge or achievement message after session completion
  const badgeMessage = getSessionBadge();
  if (badgeMessage) {
    setTimeout(() => {
      quoteElement.innerHTML = `<span style="color: #22c55e; font-weight: bold;">🎉 ${badgeMessage}</span><br>${randomQuote}`;
    }, 1000);
  }
}

function getSessionBadge() {
  const todaySessions = sessionLog.filter(session => {
    const sessionDate = new Date(session.timestamp).toDateString();
    const today = new Date().toDateString();
    return sessionDate === today && session.type === 'Work';
  }).length;

  if (todaySessions >= 4) return "Study Champion! 4+ sessions today!";
  if (todaySessions >= 2) return "Great Progress! Keep it up!";
  if (todaySessions >= 1) return "First session complete!";
  return null;
}



function checkReviewerAnswerDelayed(input, correctAnswer, container, feedback, proceedBtn) {
  proceedBtn.disabled = true;
  proceedBtn.textContent = "Checking in 3...";
  let countdown = 3;

  const interval = setInterval(() => {
    countdown--;
    proceedBtn.textContent = `Checking in ${countdown}...`;

    if (countdown === 0) {
      clearInterval(interval);
      const userAnswer = input.value.trim().toLowerCase();
      const correct = correctAnswer.toLowerCase();
      container.classList.remove("correct", "incorrect");

      if (userAnswer === correct) {
        container.classList.add("correct");
        feedback.textContent = "✅ Correct!";
        feedback.style.color = "green";
      } else {
        container.classList.add("incorrect");
        feedback.innerHTML = `❌ Wrong!<br><span style="color: #555;">Correct answer: <strong>${correctAnswer}</strong></span>`;
        feedback.style.color = "red";
      }

      proceedBtn.textContent = "Checked";
    }
  }, 1000);
}









/* Removed modal functionality and event listeners to disable modals */

const featureCards = document.querySelectorAll('.feature-card');
featureCards.forEach(card => {
  card.addEventListener('click', () => {
    const toolName = card.textContent.trim().toLowerCase().replace(/\s+/g, '');
    const toolCards = document.querySelectorAll('.tool-card');
    toolCards.forEach(card => {
      if (card.id === toolName) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
});

// Toggle tool visibility function for toggle buttons
function toggleTool(toolName) {
  const toolElement = document.getElementById(toolName);
  if (toolElement) {
    toolElement.classList.toggle('hidden');
  }
}

// Removed modal close event listeners



function setCustomBackground(color) {
  const dashboard = document.querySelector('.dashboard');
  const body = document.body;
  const profilePanel = document.getElementById('profilePanel');
  const userNameInput = document.getElementById('userName');
  if (!dashboard) return;

  if (!color) {
    // Reset to original gradient background
    dashboard.style.backgroundColor = "";
    body.style.backgroundColor = "";
    localStorage.removeItem("customBgColor");
    dashboard.classList.add("chill");
    dashboard.style.color = '#1e293b'; // default font color for gradient

    // Reset profile panel colors
    if (profilePanel) {
      profilePanel.style.backgroundColor = '#f0f9ff';
      profilePanel.style.color = '#1e293b';
    }

    // Reset input colors
    if (userNameInput) {
      userNameInput.style.backgroundColor = '#fff';
      userNameInput.style.color = '#1e293b';
    }

    // Reset title contrast
    adjustTitleContrast();
    return;
  }

  dashboard.classList.remove("chill");
  dashboard.style.backgroundColor = color;
  body.style.backgroundColor = color;
  localStorage.setItem("customBgColor", color);

  // Calculate brightness to determine font color
  const rgb = hexToRgb(color);
  if (!rgb) return;
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  if (brightness < 128) {
    // Dark background - set light font color
    dashboard.style.color = '#f0f0f0';
  } else {
    // Light background - set dark font color
    dashboard.style.color = '#1e293b';
  }

  // Adjust profile panel colors based on background
  if (profilePanel) {
    if (brightness < 128) {
      // Dark background - make profile panel lighter and text light
      profilePanel.style.backgroundColor = '#2a2a2a';
      profilePanel.style.color = '#f0f0f0';
    } else {
      // Light background - make profile panel light and text dark
      profilePanel.style.backgroundColor = '#f0f9ff';
      profilePanel.style.color = '#1e293b';
    }
  }

  // Adjust input colors based on background
  if (userNameInput) {
    if (brightness < 128) {
      // Dark background - make input light background with dark text
      userNameInput.style.backgroundColor = '#f0f0f0';
      userNameInput.style.color = '#1e293b';
    } else {
      // Light background - make input dark background with light text
      userNameInput.style.backgroundColor = '#2a2a2a';
      userNameInput.style.color = '#f0f0f0';
    }
  }

  // Adjust title contrast based on background
  adjustTitleContrast();
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
  // Expand shorthand form (e.g. "03F") to full form ("0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
    return r + r + g + g + b + b;
  });

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

window.addEventListener("DOMContentLoaded", () => {
  const currentUser = localStorage.getItem("currentUser");
  if (currentUser) {
    const user = JSON.parse(currentUser);
    document.getElementById("userName").value = user.fullName;
    document.getElementById("userName").placeholder = "Welcome, " + user.fullName;
  }

  const savedName = localStorage.getItem("userName");
  const customAvatar = localStorage.getItem("customAvatar");
  const savedColor = localStorage.getItem("customBgColor");

  loadSessionLog();

  if (savedName && !currentUser) document.getElementById("userName").value = savedName;
  if (customAvatar) document.getElementById("userAvatar").src = customAvatar;
  if (savedColor) {
    setCustomBackground(savedColor);
    const picker = document.getElementById("bgColorPicker");
    if (picker) picker.value = savedColor;
    document.body.style.backgroundColor = savedColor;
  }

  const today = new Date().toISOString().split('T')[0];
  const assignmentDate = document.getElementById('assignmentDate');
  const taskDate = document.getElementById('taskDate');

  if (assignmentDate) assignmentDate.min = today;
  if (taskDate) taskDate.min = today;

  renderCalendar();
  adjustTitleContrast();

  loadTheme();
  
  if (document.getElementById('headerBgColorPicker')) {
    document.getElementById('headerBgColorPicker').value = '#008080';
  }
  if (document.getElementById('homepageBgColorPicker')) {
    document.getElementById('homepageBgColorPicker').value = '#ffffff';
  }
});

// Add logout functionality
function logout() {
  localStorage.removeItem("currentUser");
  alert("You have been logged out.");
  window.location.href = "form.html";
}

function showSection(sectionId) {
  const sections = document.querySelectorAll('.section');
  sections.forEach(section => section.style.display = 'none');

  const targetSection = document.getElementById(sectionId);
  targetSection.style.display = 'block';

  // Smooth scroll to the section
  targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const buttons = document.querySelectorAll('.toggle-button');
  buttons.forEach(btn => btn.classList.remove('active'));

  const clickedButton = [...buttons].find(btn =>
    btn.textContent.toLowerCase().includes(sectionId)
  );

  if (clickedButton) {
    clickedButton.classList.add('active');
  }
}

function showAbout() {
  event.preventDefault();
  document.getElementById('about-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Prevent background scroll
}

function showFeatures() {
  event.preventDefault();
  document.getElementById('features-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Prevent background scroll
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  document.body.style.overflow = 'auto'; // Restore scroll
}

function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Close modal when clicking on backdrop
document.addEventListener('click', function(event) {
  if (event.target.classList.contains('modal-overlay')) {
    event.target.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
});

// Deactivate toggle buttons when clicking outside
document.addEventListener('click', function(event) {
  const buttonContainer = document.querySelector('.button-container');
  const sections = document.querySelectorAll('.section');

  // If click is outside button container and sections, deactivate all buttons
  if (!buttonContainer.contains(event.target) &&
      !Array.from(sections).some(section => section.contains(event.target))) {
    const buttons = document.querySelectorAll('.toggle-button');
    buttons.forEach(btn => btn.classList.remove('active'));

    // Hide all sections
    sections.forEach(section => section.style.display = 'none');
  }
});

// CALCULATOR FUNCTIONS
// Scientific Calculator with DEG/RAD mode, error handling, and keyboard support
// Features: basic arithmetic, trig functions, logs, roots, factorial, parentheses
// Safe evaluation without eval(), proper precedence with PEMDAS
let calcMode = 'deg'; // 'deg' or 'rad'
let calcExpression = '';
let calcResult = null;

function appendCalc(value) {
  const calcExpressionEl = document.getElementById("calcExpression");
  const calcResultEl = document.getElementById("calcResult");

  // If we have a result and user starts typing, clear the display
  if (calcResult !== null && !isNaN(value) && value !== '.') {
    clearAll();
  }

  // Handle special cases
  const exprInitialSize = window.innerWidth < 768 ? 14 : 18;
  if (value === 'Math.PI') {
    calcExpression += 'π';
    calcExpressionEl.textContent = calcExpression;
    adjustFontSize(calcExpressionEl, exprInitialSize, 10);
    calcExpressionEl.scrollLeft = calcExpressionEl.scrollWidth;
  } else if (value === 'Math.E') {
    calcExpression += 'e';
    calcExpressionEl.textContent = calcExpression;
    adjustFontSize(calcExpressionEl, exprInitialSize, 10);
    calcExpressionEl.scrollLeft = calcExpressionEl.scrollWidth;
  } else {
    calcExpression += value;
    calcExpressionEl.textContent = calcExpression;
    adjustFontSize(calcExpressionEl, exprInitialSize, 10);
    calcExpressionEl.scrollLeft = calcExpressionEl.scrollWidth;
  }

  calcResult = null;
  calcResultEl.textContent = '';
}

function calculate() {
  const calcExpressionEl = document.getElementById("calcExpression");
  const calcResultEl = document.getElementById("calcResult");
  const resultInitialSize = window.innerWidth < 768 ? 18 : 24;

  if (calcExpression.trim() === "") {
    calcResultEl.textContent = "0";
    adjustFontSize(calcResultEl, resultInitialSize, 12);
    calcResultEl.scrollLeft = calcResultEl.scrollWidth;
    return;
  }

  try {
    const result = evaluateExpression(calcExpression);
    if (result === null || (typeof result === 'number' && (isNaN(result) || !isFinite(result)))) {
      calcResultEl.textContent = "Error";
      calcResult = null;
      adjustFontSize(calcResultEl, resultInitialSize, 12);
      calcResultEl.scrollLeft = calcResultEl.scrollWidth;
    } else if (typeof result === 'string' && result.startsWith('Error:')) {
      calcResultEl.textContent = result;
      calcResult = null;
      adjustFontSize(calcResultEl, resultInitialSize, 12);
      calcResultEl.scrollLeft = calcResultEl.scrollWidth;
    } else {
      // Round to 12 decimal places but remove trailing zeros
      const rounded = parseFloat(result.toPrecision(12));
      calcResultEl.textContent = rounded.toString();
      calcResult = rounded;
      adjustFontSize(calcResultEl, resultInitialSize, 12);
      calcResultEl.scrollLeft = calcResultEl.scrollWidth;
      // Keep expression for history, but don't overwrite
    }
  } catch (error) {
    calcResultEl.textContent = error.message || "Error";
    calcResult = null;
    adjustFontSize(calcResultEl, resultInitialSize, 12);
    calcResultEl.scrollLeft = calcResultEl.scrollWidth;
  }
}

function evaluateExpression(expr) {
  // Replace symbols and handle special cases
  let processed = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, Math.PI.toString())
    .replace(/e/g, Math.E.toString());

  // Handle factorial
  processed = processed.replace(/(\d+(?:\.\d+)?)!/g, (match, num) => {
    const n = parseFloat(num);
    if (!Number.isInteger(n) || n < 0 || n > 170) return 'Error: integer only';
    return factorial(n).toString();
  });

  // Handle power
  processed = processed.replace(/(\d+(?:\.\d+)?)\^(\d+(?:\.\d+)?)/g, (match, base, exp) => {
    return Math.pow(parseFloat(base), parseFloat(exp)).toString();
  });

  // Handle functions with degree/radian conversion
  const funcRegex = /(sin|cos|tan|asin|acos|atan|log|ln|sqrt|cbrt)\(([^)]+)\)/g;
  processed = processed.replace(funcRegex, (match, func, arg) => {
    const value = parseFloat(arg);
    if (isNaN(value)) return 'NaN';

    switch (func) {
      case 'sin':
        return calcMode === 'deg' ? Math.sin(value * Math.PI / 180) : Math.sin(value);
      case 'cos':
        return calcMode === 'deg' ? Math.cos(value * Math.PI / 180) : Math.cos(value);
      case 'tan':
        return calcMode === 'deg' ? Math.tan(value * Math.PI / 180) : Math.tan(value);
      case 'asin':
        if (value < -1 || value > 1) return 'Error: invalid input';
        const asinResult = Math.asin(value);
        return calcMode === 'deg' ? asinResult * 180 / Math.PI : asinResult;
      case 'acos':
        if (value < -1 || value > 1) return 'Error: invalid input';
        const acosResult = Math.acos(value);
        return calcMode === 'deg' ? acosResult * 180 / Math.PI : acosResult;
      case 'atan':
        const atanResult = Math.atan(value);
        return calcMode === 'deg' ? atanResult * 180 / Math.PI : atanResult;
      case 'log':
        if (value <= 0) return 'Error: invalid input';
        return Math.log10(value);
      case 'ln':
        if (value <= 0) return 'Error: invalid input';
        return Math.log(value);
      case 'sqrt':
        if (value < 0) return 'Error: invalid input';
        return Math.sqrt(value);
      case 'cbrt':
        return Math.cbrt(value);
      default:
        return match;
    }
  });

  // Handle percentage
  processed = processed.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => {
    return (parseFloat(num) / 100).toString();
  });

  // Use a safe evaluation method
  return safeEval(processed);
}

function safeEval(expr) {
  // Simple recursive descent parser for basic arithmetic with parentheses
  // This avoids using eval() for security

  // Remove spaces
  expr = expr.replace(/\s/g, '');

  // Handle implicit multiplication (number followed by parenthesis)
  expr = expr.replace(/(\d)(\()/g, '$1*(');

  let index = 0;

  function parseExpression() {
    let result = parseTerm();

    while (index < expr.length) {
      const char = expr[index];
      if (char === '+') {
        index++;
        result += parseTerm();
      } else if (char === '-') {
        index++;
        result -= parseTerm();
      } else {
        break;
      }
    }

    return result;
  }

  function parseTerm() {
    let result = parseFactor();

    while (index < expr.length) {
      const char = expr[index];
      if (char === '*') {
        index++;
        result *= parseFactor();
      } else if (char === '/') {
        index++;
        const divisor = parseFactor();
        if (divisor === 0) throw new Error('Division by zero');
        result /= divisor;
      } else {
        break;
      }
    }

    return result;
  }

  function parseFactor() {
    if (expr[index] === '(') {
      index++;
      const result = parseExpression();
      if (expr[index] === ')') {
        index++;
      }
      return result;
    } else if (expr[index] === '-') {
      index++;
      return -parseFactor();
    } else {
      return parseNumber();
    }
  }

  function parseNumber() {
    let numStr = '';
    while (index < expr.length && (/\d|\./.test(expr[index]))) {
      numStr += expr[index];
      index++;
    }
    const num = parseFloat(numStr);
    return isNaN(num) ? 0 : num;
  }

  try {
    return parseExpression();
  } catch (error) {
    return null;
  }
}

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

function toggleMode() {
  calcMode = calcMode === 'deg' ? 'rad' : 'deg';
  document.getElementById('modeBtn').textContent = calcMode.toUpperCase();
  document.getElementById('calcMode').textContent = calcMode.toUpperCase();
}

function clearAll() {
   calcExpression = '';
   calcResult = null;
   const calcExpressionEl = document.getElementById("calcExpression");
   const calcResultEl = document.getElementById("calcResult");
   calcExpressionEl.textContent = '';
   calcResultEl.textContent = '';
   calcExpressionEl.style.fontSize = (window.innerWidth < 768 ? 14 : 18) + 'px';
   calcResultEl.style.fontSize = (window.innerWidth < 768 ? 18 : 24) + 'px';
}

function clearEntry() {
   calcExpression = '';
   const calcExpressionEl = document.getElementById("calcExpression");
   const calcResultEl = document.getElementById("calcResult");
   calcExpressionEl.textContent = '';
   calcResultEl.textContent = '';
   calcResult = null;
   calcExpressionEl.style.fontSize = (window.innerWidth < 768 ? 14 : 18) + 'px';
   calcResultEl.style.fontSize = (window.innerWidth < 768 ? 18 : 24) + 'px';
}

function backspace() {
   if (calcExpression.length > 0) {
     calcExpression = calcExpression.slice(0, -1);
     const calcExpressionEl = document.getElementById("calcExpression");
     calcExpressionEl.textContent = calcExpression;
     adjustFontSize(calcExpressionEl, window.innerWidth < 768 ? 14 : 18, 10);
     calcExpressionEl.scrollLeft = calcExpressionEl.scrollWidth;
   }
}

// Function to adjust font size to prevent overflow
function adjustFontSize(element, initialSize, minSize) {
   element.style.fontSize = initialSize + 'px';
   let fontSize = initialSize;
   // Allow small tolerance for rounding
   while (element.scrollWidth > element.clientWidth + 5 && fontSize > minSize) {
     fontSize -= 1;
     element.style.fontSize = fontSize + 'px';
   }
}

// Keyboard support
document.addEventListener('keydown', function(event) {
   const key = event.key;

   // Check if calculator section is visible
   const calculatorSection = document.getElementById('calculator');
   if (!calculatorSection || calculatorSection.style.display === 'none') {
     return;
   }

  if (key >= '0' && key <= '9') {
    appendCalc(key);
  } else if (key === '.') {
    appendCalc('.');
  } else if (key === '+') {
    appendCalc('+');
  } else if (key === '-') {
    appendCalc('-');
  } else if (key === '*') {
    appendCalc('*');
  } else if (key === '/') {
    appendCalc('/');
  } else if (key === '(') {
    appendCalc('(');
  } else if (key === ')') {
    appendCalc(')');
  } else if (key === 'Enter' || key === '=') {
    event.preventDefault();
    calculate();
  } else if (key === 'Backspace') {
    event.preventDefault();
    backspace();
  } else if (key === 'Escape') {
    clearAll();
  } else if (key.toLowerCase() === 'd') {
    // Toggle degree/radian mode
    toggleMode();
  }

  // Prevent default behavior for calculator keys
  if (/[0-9.+\-*/()=]|Enter|Backspace|Escape/.test(key) || key.toLowerCase() === 'd') {
    event.preventDefault();
  }
});

// Initialize calculator
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('modeBtn').textContent = calcMode.toUpperCase();
  document.getElementById('calcMode').textContent = calcMode.toUpperCase();
});




// NOTES FUNCTIONS
function addNote() {
  const noteInput = document.getElementById("noteInput");
  const noteList = document.getElementById("noteList");
  const noteText = noteInput.value.trim();

  if (noteText !== "") {
    const li = document.createElement("li");
    li.className = "note-item";
    li.textContent = noteText;
    noteList.appendChild(li);
    noteInput.value = "";
    updateCharCount();
    addNotification("Sticky note added: '" + noteText + "'");
  } else {
    // Prevent adding empty notes
    noteInput.focus();
  }
}

function resetNotes() {
  document.getElementById("noteList").innerHTML = "";
  updateCharCount();
}

// CALENDAR FUNCTIONS with Integration
let currentCalendarDate = new Date();
let calendarEvents = [];

function renderCalendar() {
  const calendarDays = document.getElementById('calendarDays');
  const monthYearDisplay = document.getElementById('calendarMonthYear');

  // Clear previous days
  calendarDays.innerHTML = '';

  // Set month and year display
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];
  monthYearDisplay.textContent = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;

  // Get first day of month and last day
  const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
  const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
  const today = new Date();

  // Add empty cells for days before first day of month
  for (let i = 0; i < firstDay.getDay(); i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day empty';
    calendarDays.appendChild(emptyDay);
  }

  // Add days of the month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.textContent = day;

    const currentDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
    const dateString = currentDate.toDateString();

    // Check if this is today
    if (day === today.getDate() &&
        currentCalendarDate.getMonth() === today.getMonth() &&
        currentCalendarDate.getFullYear() === today.getFullYear()) {
      dayElement.classList.add('today');
    }

    // Check if this is selected date
    const selectedDate = document.getElementById('selectedDateDisplay');
    if (selectedDate && selectedDate.textContent !== 'None') {
      const selected = new Date(selectedDate.textContent);
      if (day === selected.getDate() &&
          currentCalendarDate.getMonth() === selected.getMonth() &&
          currentCalendarDate.getFullYear() === selected.getFullYear()) {
        dayElement.classList.add('selected');
      }
    }

    // Check for events on this day
    const dayEvents = calendarEvents.filter(event => {
      const eventDate = new Date(event.date).toDateString();
      return eventDate === dateString;
    });

    if (dayEvents.length > 0) {
      dayElement.classList.add('has-events');
      if (dayEvents.some(e => e.type === 'task')) dayElement.classList.add('task-event');
      if (dayEvents.some(e => e.type === 'assignment' && !e.completed)) dayElement.classList.add('assignment-event');
      if (dayEvents.some(e => e.type === 'assignment' && e.completed)) dayElement.classList.add('completed-assignment-event');

      // Enhanced hover popups with detailed information
      dayElement.onmouseenter = (e) => showTooltip(e, dayEvents);
      dayElement.onmouseleave = hideTooltip;
    }

    dayElement.onclick = () => selectDate(day);
    calendarDays.appendChild(dayElement);
  }
}

function prevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
}

function selectDate(day) {
  const selectedDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
  const selectedDisplay = document.getElementById('selectedDateDisplay');
  selectedDisplay.textContent = selectedDate.toLocaleDateString();

  // Re-render to show selected date
  renderCalendar();
}

function syncToCalendar(title, date, type) {
  calendarEvents.push({
    title: title,
    date: date,
    type: type
  });
  renderCalendar();
}

// Ensure assignments are automatically synced when added

// Removed calendar filter functions as per requirements

function showTooltip(event, events) {
  const tooltip = document.getElementById('calendarTooltip');
  const eventDetails = events.map(e => {
    const typeIcon = e.type === 'task' ? '📝' : '📅';
    const dueInfo = e.type === 'assignment' ? ` (Due: ${e.date})` : '';
    const completedInfo = e.completed ? ' ✅' : '';
    return `${typeIcon} ${e.title}${dueInfo}${completedInfo}`;
  }).join('<br>');
  tooltip.innerHTML = eventDetails;
  tooltip.style.display = 'block';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY - 10 + 'px';
}

function hideTooltip() {
  document.getElementById('calendarTooltip').style.display = 'none';
}

// Initialize calendar when DOM loads
document.addEventListener('DOMContentLoaded', function() {
  renderCalendar();

  // Calendar is now always showing all events without filtering
});

function updateCharCount() {
  const noteInput = document.getElementById("noteInput");
  const charCount = document.getElementById("charCount");
  charCount.textContent = noteInput.value.length;
}

// Initialize character counter
document.addEventListener('DOMContentLoaded', function() {
  const noteInput = document.getElementById("noteInput");
  if (noteInput) {
    noteInput.addEventListener('input', updateCharCount);
    updateCharCount(); // Initial count
  }
});

// Function to adjust title contrast based on background
function adjustTitleContrast() {
  const dashboard = document.querySelector('.dashboard');
  const titleText = document.querySelector('.title-text');

  if (!dashboard || !titleText) return;

  // Get computed background color
  const bgColor = window.getComputedStyle(dashboard).backgroundColor;

  // If it's transparent or default gradient, use default styling
  if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent' || dashboard.classList.contains('chill')) {
    titleText.setAttribute('fill', '#1e293b');
    titleText.setAttribute('stroke', 'rgba(255, 255, 255, 0.3)');
    titleText.setAttribute('stroke-width', '0.5');
    titleText.style.filter = 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.6))';
    return;
  }

  // Parse RGB values from background-color
  const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!rgbMatch) return;

  const r = parseInt(rgbMatch[1]);
  const g = parseInt(rgbMatch[2]);
  const b = parseInt(rgbMatch[3]);

  // Calculate brightness (0-255)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  if (brightness < 128) {
    // Dark background - use white text with white glow and stroke
    titleText.setAttribute('fill', '#ffffff');
    titleText.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
    titleText.setAttribute('stroke-width', '0.5');
    titleText.style.filter = 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.8))';
  } else {
    // Light background - use dark text with dark glow and stroke
    titleText.setAttribute('fill', '#1e293b');
    titleText.setAttribute('stroke', 'rgba(0, 0, 0, 0.2)');
    titleText.setAttribute('stroke-width', '0.5');
    titleText.style.filter = 'drop-shadow(0 0 12px rgba(0, 0, 0, 0.4))';
  }
}

// Sidebar toggle function
function toggleSidebar() {
  const sidebar = document.getElementById('sidebarDock');
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // On mobile, toggle collapsed state (show/hide dock buttons)
    sidebar.classList.toggle('collapsed');
  } else {
    // On desktop, toggle expanded/collapsed for sidebar width
    sidebar.classList.toggle('collapsed');
  }
}

// Initialize sidebar state based on screen size
function initSidebar() {
  const sidebar = document.getElementById('sidebarDock');
  if (!sidebar) return;
  
  if (window.innerWidth <= 768) {
    // Start collapsed on mobile
    sidebar.classList.add('collapsed');
    sidebar.classList.remove('expanded');
  } else {
    // Start expanded on desktop
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('expanded');
  }
}

// Re-initialize sidebar on resize
window.addEventListener('resize', function() {
  initSidebar();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  initSidebar();
});

// Background Images Slideshow
let currentImageIndex = 0;
const images = document.querySelectorAll('.images-container img');

function showImage(index) {
  images.forEach((img, i) => {
    if (i === index) {
      img.classList.add('active');
    } else {
      img.classList.remove('active');
    }
  });
  currentImageIndex = index;
}

function nextImage() {
  currentImageIndex = (currentImageIndex + 1) % images.length;
  showImage(currentImageIndex);
}

// Start slideshow, show first image
if (images.length > 0) {
  showImage(0);
  setInterval(nextImage, 4000);
}






function markDone(checkbox) {
  const li = checkbox.parentElement;
  li.classList.toggle("done", checkbox.checked);

  // Update localStorage for tasks
  if (li.closest('#taskList')) {
    const taskList = document.getElementById('taskList');
    const index = Array.from(taskList.children).indexOf(li);
    const tasks = getTasks();
    if (tasks[index]) {
      tasks[index].completed = checkbox.checked;
      saveTasks(tasks);
      saveTaskProgress();
    }
  }

  // Update localStorage for assignments
  if (li.closest('#assignmentList')) {
    const assignmentList = document.getElementById('assignmentList');
    const index = Array.from(assignmentList.children).indexOf(li);
    const assignments = getAssignments();
    if (assignments[index]) {
      assignments[index].completed = checkbox.checked;
      saveAssignments(assignments);
      saveAssignmentProgress();
    }
    // Update calendar entry when assignment is completed
    updateCalendarEntryOnCompletion(li, checkbox.checked);
  }

  // Enable/disable delete button based on checkbox state
  const deleteBtn = li.querySelector('.delete-btn');
  if (deleteBtn) {
    deleteBtn.disabled = !checkbox.checked;
    deleteBtn.style.opacity = checkbox.checked ? '1' : '0.3';
    deleteBtn.title = checkbox.checked ? 'Delete item' : 'Check to enable delete';
  }
}

function removeItem(btn) {
  // Only allow deletion if item is checked
  const li = btn.parentElement;
  const checkbox = li.querySelector('input[type="checkbox"]');
  if (!checkbox || !checkbox.checked) {
    return; // Don't remove if not checked
  }

  // Remove from calendar events if it's an assignment
  if (li.closest('#assignmentList')) {
    removeCalendarEntry(li);
  }

  li.remove();
}

function updateCalendarEntryOnCompletion(assignmentLi, isCompleted) {
  const assignmentText = assignmentLi.querySelector('.assignment-text').textContent;
  const assignmentDate = assignmentLi.querySelector('.assignment-date').textContent.replace('Due: ', '');

  // Find and update the corresponding calendar event
  const eventIndex = calendarEvents.findIndex(event =>
    event.title === assignmentText &&
    event.date === assignmentDate &&
    event.type === 'assignment'
  );

  if (eventIndex !== -1) {
    calendarEvents[eventIndex].completed = isCompleted;
    renderCalendar();
  }
}

function removeCalendarEntry(assignmentLi) {
  const assignmentText = assignmentLi.querySelector('.assignment-text').textContent;
  const assignmentDate = assignmentLi.querySelector('.assignment-date').textContent.replace('Due: ', '');

  // Remove the corresponding calendar event
  calendarEvents = calendarEvents.filter(event =>
    !(event.title === assignmentText &&
      event.date === assignmentDate &&
      event.type === 'assignment')
  );
  renderCalendar();
}






// Todo List Functions with Priority, Date, and Drag-and-Drop
function addTask() {
  const taskInput = document.getElementById("taskInput");
  const taskPriority = document.getElementById("taskPriority");
  const taskDate = document.getElementById("taskDate");
  const taskText = taskInput.value.trim();
  const priority = taskPriority.value;
  const date = taskDate.value;

  if (taskText) {
//eto simula

// SAVE TASK
const tasks = getTasks();

tasks.push({
  text: taskText,
  priority: priority,
  date: date,
  completed: false
});

saveTasks(tasks);

    //eto dulo
    const li = document.createElement("li");
    li.className = `priority-${priority}`;
    li.draggable = true;
    li.innerHTML = `
      <input type="checkbox" onchange="markDone(this)">
      <span class="task-text">${taskText}</span>
      ${date ? `<span class="task-date">(${date})</span>` : ''}
      <span class="priority-label">${priority.charAt(0).toUpperCase() + priority.slice(1)}</span>
      <button class="delete-btn" onclick="removeItem(this)" disabled title="Check to enable delete">❌</button>
    `;
    document.getElementById("taskList").appendChild(li);
    taskInput.value = "";
    taskDate.value = "";

    // Sync to calendar if date is provided
    if (date) {
      syncToCalendar(taskText, date, 'task');
    }

    // Add drag and drop listeners
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);

    // Add completion animation with confetti effect
    const checkbox = li.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        li.style.animation = 'completeTask 0.5s ease';
        // Add confetti effect
        createConfetti(li);
        setTimeout(() => {
          li.style.animation = '';
        }, 500);
      }
      checkAllTasksCompleted();
    });

    addNotification("New task added: '" + taskText + "'");
  }
}

function resetTasks() {
  document.getElementById("taskList").innerHTML = "";
}

// Drag and Drop for Tasks
let draggedElement = null;

function handleDragStart(e) {
  draggedElement = e.target;
  e.target.style.opacity = '0.5';
}

function handleDragOver(e) {
  e.preventDefault();
}

function handleDrop(e) {
  e.preventDefault();
  if (draggedElement && draggedElement !== e.target && e.target.tagName === 'LI') {
    const list = document.getElementById('taskList');
    const items = Array.from(list.children);
    const draggedIndex = items.indexOf(draggedElement);
    const targetIndex = items.indexOf(e.target);

    if (draggedIndex < targetIndex) {
      list.insertBefore(draggedElement, e.target.nextSibling);
    } else {
      list.insertBefore(draggedElement, e.target);
    }
  }
}

function handleDragEnd(e) {
  e.target.style.opacity = '1';
  draggedElement = null;
}

//eto simulaaaaaaaaaaaaaaaaaaaaaaaaaaa
function loadTasks() {
  const tasks = getTasks();
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  tasks.forEach((task, index) => {
    const li = document.createElement("li");
    li.className = `priority-${task.priority}`;
    li.draggable = true;

    li.innerHTML = `
      <input type="checkbox" ${task.completed ? "checked" : ""}>
      <span class="task-text">${task.text}</span>
      ${task.date ? `<span class="task-date">(${task.date})</span>` : ''}
      <span class="priority-label">${task.priority}</span>
      <button class="delete-btn" ${!task.completed ? "disabled" : ""}>❌</button>
    `;

    const checkbox = li.querySelector('input');
    const deleteBtn = li.querySelector('.delete-btn');

    checkbox.addEventListener('change', () => {
      const tasks = getTasks();
      tasks[index].completed = checkbox.checked;
      saveTasks(tasks);

      if (checkbox.checked) {
        deleteBtn.disabled = false;
        createConfetti(li);
      } else {
        deleteBtn.disabled = true;
      }

      checkAllTasksCompleted();
    });

    deleteBtn.addEventListener('click', () => {
  if (!checkbox.checked) {
    alert("✔ Please complete the task first!");
    return;
  }

  deleteTask(index);
});

    list.appendChild(li);
  });

  function deleteTask(index) {
  const tasks = getTasks();
  tasks.splice(index, 1);
  saveTasks(tasks);
  loadTasks();
}


}

//eto dulooooooooooooooooooooooo
// Confetti effect for task completion
function createConfetti(element) {
  const confettiCount = 20;
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b'];

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDelay = Math.random() * 0.5 + 's';
    element.appendChild(confetti);

    setTimeout(() => {
      confetti.remove();
    }, 1000);
  }
}

// Assignment Tracker Functions with Deadline Alerts and Keyword Filter
function addAssignment() {
  const assignmentInput = document.getElementById("assignmentInput");
  const assignmentDate = document.getElementById("assignmentDate");
  const assignmentText = assignmentInput.value.trim();
  const dateValue = assignmentDate.value;

  if (assignmentText && dateValue) {

    // SAVE TO LOCAL STORAGE
const assignments = getAssignments();

assignments.push({
  text: assignmentText,
  date: dateValue,
  completed: false
});

saveAssignments(assignments);
    
    //hanggang dito lang
    const li = document.createElement("li");
    const dueDate = new Date(dateValue);
    const today = new Date();
    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    let className = '';
    if (daysDiff <= 3 && daysDiff > 0) {
      className = 'due-soon';
    } else if (daysDiff < 0) {
      className = 'due-overdue';
    }

    li.className = className;
    li.innerHTML = `
      <input type="checkbox" onchange="markDone(this); updateProgress()">
      <span class="assignment-text">${assignmentText}</span>
      <span class="assignment-date">Due: ${dateValue}</span>
      ${daysDiff <= 3 && daysDiff > 0 ? '<span class="alert-icon">⚠️</span>' : ''}
      ${daysDiff < 0 ? '<span class="alert-icon">🚨</span>' : ''}
      <button class="delete-btn" onclick="removeItem(this); updateProgress()" disabled title="Check to enable delete">❌</button>
    `;
    document.getElementById("assignmentList").appendChild(li);
    assignmentInput.value = "";
    assignmentDate.value = "";

    updateProgress();

    // Sync with calendar - automatically add to calendar
    syncToCalendar(assignmentText, dateValue, 'assignment');

    // Set min date to today to prevent past dates
    const minDate = new Date().toISOString().split('T')[0];
    assignmentDate.min = minDate;

    addNotification("Assignment logged: '" + assignmentText + "'");
  } else {
    alert("Please enter both assignment name and date.");
  }
}

function resetAssignments() {
  document.getElementById("assignmentList").innerHTML = "";
  updateProgress();
}

function updateProgress() {
  const assignments = document.querySelectorAll('#assignmentList li');
  const completed = document.querySelectorAll('#assignmentList li input:checked').length;
  const total = assignments.length;
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  const completedAssignments = document.querySelectorAll('#assignmentList li input:checked').length;
localStorage.setItem("completedAssignments", completedAssignments);

  document.getElementById('assignmentProgress').style.width = `${percentage}%`;
  document.getElementById('assignmentProgressText').textContent = `${completed}/${total} Completed`;


}
//eto simula

function loadAssignments() {
  const assignments = getAssignments();
  const list = document.getElementById("assignmentList");
  list.innerHTML = "";

  assignments.forEach((item, index) => {
    const li = document.createElement("li");

    const dueDate = new Date(item.date);
    const today = new Date();
    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    let className = '';
    if (daysDiff <= 3 && daysDiff > 0) {
      className = 'due-soon';
    } else if (daysDiff < 0) {
      className = 'due-overdue';
    }

    li.className = className;

    li.innerHTML = `
      <input type="checkbox" ${item.completed ? "checked" : ""}>
      <span class="assignment-text">${item.text}</span>
      <span class="assignment-date">Due: ${item.date}</span>
      ${daysDiff <= 3 && daysDiff > 0 ? '<span class="alert-icon">⚠️</span>' : ''}
      ${daysDiff < 0 ? '<span class="alert-icon">🚨</span>' : ''}
      <button class="delete-btn" ${!item.completed ? "disabled" : ""}>❌</button>
    `;

    const checkbox = li.querySelector('input');
    const deleteBtn = li.querySelector('.delete-btn');

    checkbox.addEventListener('change', () => {
      const assignments = getAssignments();
      assignments[index].completed = checkbox.checked;
      saveAssignments(assignments);

      if (checkbox.checked) {
        deleteBtn.disabled = false;
        createConfetti(li); // 🎉 same effect
      } else {
        deleteBtn.disabled = true;
      }

      updateProgress();
    });

    deleteBtn.addEventListener('click', () => {
  if (!checkbox.checked) {
    alert("✔ Please complete the task first!");
    return;
  }

  deleteAssignments(index);
});

function deleteAssignments(index) {
  const tasks = getAssignments();
  tasks.splice(index, 1);
  saveAssignments(tasks);
  loadAssignments();
}

    list.appendChild(li);
  });

  updateProgress();
}



// hanggang dito lang din
// Removed filter functions as per requirements

// Reviewer functions
function convertReviewer() {
  const fileInput = document.getElementById("reviewFile");
  const type = document.getElementById("conversionType").value;
  const output = document.getElementById("reviewerOutput");
  const preview = document.getElementById("filePreview");

  output.innerHTML = "";
  preview.innerHTML = "";

  if (!fileInput.files.length || !type) {
    alert("Please upload a file and select a conversion type.");
    return;
  }

  const file = fileInput.files[0];
  
  // Helper function to render questions
  function renderQuestions(questions) {
    output.innerHTML = "";
    
    // Safety check: ensure questions is valid array
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      console.warn("No valid questions to render");
      output.innerHTML = "<p>No questions available.</p>";
      return;
    }
    
    questions.forEach((item, index) => {
      // Safety check: ensure item is valid
      if (!item || !item.q) {
  console.warn("Invalid question item at index:", index);
  return;
}
      
      const div = document.createElement("div");
      div.className = "reviewer-question";
      div.innerHTML = `<p><strong>Q${index + 1}:</strong> ${item.q}</p>`;

      let input;
      if (item.options) {
        input = document.createElement("select");
        input.addEventListener("change", () => {
  input.disabled = true;
});
        item.options.forEach(opt => {
          const option = document.createElement("option");
          option.value = opt;
          option.textContent = opt;
          input.appendChild(option);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Your answer";
      }

      const feedback = document.createElement("div");
      feedback.className = "feedback";

      const proceedBtn = document.createElement("button");
      proceedBtn.textContent = "Proceed";
      proceedBtn.onclick = () => checkReviewerAnswerDelayed(input, item.a, div, feedback, proceedBtn);

      div.appendChild(input);
      div.appendChild(proceedBtn);
      div.appendChild(feedback);
      output.appendChild(div);
    });
  }

  // Handle different file types
  if (file.type.includes("image") || file.type === "application/pdf") {
    // For images and PDFs, show preview and use placeholder
    const reader = new FileReader();
    reader.onload = function(e) {
      const fileURL = e.target.result;
      if (file.type.includes("image")) {
        preview.innerHTML = `<img src="${fileURL}" alt="Screenshot Preview">`;
      } else if (file.type === "application/pdf") {
        preview.innerHTML = `<embed src="${fileURL}" type="application/pdf">`;
      }
      
      // Use placeholder for images/PDFs
      let questions = [];
      if (type === "quiz") {
        questions = [
          { q: "What is shown in the image?", a: "main idea" },
          { q: "List one key detail.", a: "key point" }
        ];
      } else if (type === "mock") {
        questions = [
          { q: "Describe what you see.", a: "description" },
          { q: "What is the main point?", a: "main point" }
        ];
      } else if (type === "mcq") {
        // Use empty array for MCQ - requires text input
        renderQuestions([]);
      }
      renderQuestions(questions);
    };
    reader.readAsDataURL(file);
  } else {
    // For text files, read as text and process
    const reader = new FileReader();
    reader.onload = function(e) {
      const textContent = e.target.result;
      preview.innerHTML = `<pre style="max-height: 200px; overflow: auto;">${textContent.substring(0, 1000)}</pre>`;
      
      if (type === "mcq") {
        // Generate MCQ from text using JavaScript (no PHP needed)
        console.log("Generating MCQ from text...");
        
        const questions = generateMCQFromText(textContent);
        
        if (questions && questions.length > 0) {
          renderQuestions(questions);
        } else {
          // Fallback: generate MCQ from extracted sentences
          const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
          if (sentences.length > 0) {
            const fallbackQuestions = generateMCQFromSentences(sentences);
            if (fallbackQuestions.length > 0) {
              renderQuestions(fallbackQuestions);
            } else {
              renderQuestions([]);
              output.innerHTML = "<p style='color: #666;'>Could not generate MCQ. Please provide more text content.</p>";
            }
          } else {
            renderQuestions([]);
            output.innerHTML = "<p style='color: #666;'>Could not generate MCQ. Please provide more text content.</p>";
          }
        }
      } else {
        // Non-MCQ types
        let questions = [];
        if (type === "quiz") {
          questions = [
            { q: "What is the main idea of the uploaded content?", a: "main idea" },
            { q: "List one key point.", a: "key point" }
          ];
        } else if (type === "mock") {
          questions = [
            { q: "Define the topic discussed.", a: "definition" },
            { q: "Give one example.", a: "example" }
          ];

if (!questions || questions.length === 0) {
  console.warn("No valid MCQ after filtering");
  renderQuestions([]);
  return;
}

        }
        renderQuestions(questions);
      }
    };
    reader.readAsText(file);
  }
}

function resetReviewer() {
  document.getElementById("reviewFile").value = "";
  document.getElementById("conversionType").value = "";
  document.getElementById("filePreview").innerHTML = "";
  document.getElementById("reviewerOutput").innerHTML = "";
}

// Additional reset functions for calculator and sticky notes
function resetHistory() {
  document.getElementById("calcHistory").innerHTML = "";
}

// Main Notes functionality
document.addEventListener('DOMContentLoaded', function() {
  const notesArea = document.getElementById('notesArea');

  // Font color picker
  document.getElementById('fontColorPicker').addEventListener('input', function() {
    document.execCommand('foreColor', false, this.value);
    notesArea.focus();
  });

  // Highlighter tool
  document.getElementById('highlighterTool').addEventListener('click', function() {
    // Apply pastel highlight color
    document.execCommand('backColor', false, '#fef3c7');
    notesArea.focus();
  });

  // Eraser tool
  document.getElementById('eraserTool').addEventListener('click', function() {
    notesArea.innerHTML = '';
    notesArea.focus();
  });

  // Pen tool (default typing)
  document.getElementById('penTool').addEventListener('click', function() {
    notesArea.focus();
  });

  // Shortcut button functionality
  initShortcutButtons();
});

// Shortcut button handlers
function initShortcutButtons() {
  const shortcutButtons = document.querySelectorAll('.shortcut-btn');
  
  shortcutButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation();
      const target = this.getAttribute('data-target');
      
      // Toggle modules: Main Notes, To-Do List, Assignment Tracker, Study Timer
      const toggleModules = ['main-notes', 'todo-list', 'assignment-tracker', 'study-timer'];
      
      // Direct modules: Calculator, Sticky Notes, Calendar (exclusive display)
      const directModules = ['Calculator', 'StickyNotes', 'Calendar'];
      
      if (toggleModules.includes(target)) {
        toggleModule(target);
      } else if (directModules.includes(target)) {
        showDirectModule(target);
      }
    });
  });
}

// Close modules when clicking outside
document.addEventListener('click', function(event) {
  const directModules = ['calculator', 'notes', 'calendar'];
  const moduleElements = directModules.map(id => document.getElementById(id));
  
  // Check if click is outside any of the modules and not on a shortcut button
  const isOnModule = moduleElements.some(module => module && module.contains(event.target));
  const isOnShortcutButton = event.target.closest('.shortcut-btn');
  const isOnToggleButton = event.target.closest('.toggle-button');
  
  if (!isOnModule && !isOnShortcutButton && !isOnToggleButton) {
    closeAllDirectModules();
    updateToggleButtonsState();
  }
});

function closeAllDirectModules() {
  const directModules = ['calculator', 'notes', 'calendar'];
  directModules.forEach(id => {
    const module = document.getElementById(id);
    if (module) {
      module.style.display = 'none';
      module.classList.remove('active');
    }
  });
}

function updateToggleButtonsState() {
  const toggleButtons = document.querySelectorAll('.toggle-button');
  toggleButtons.forEach(btn => btn.classList.remove('active'));
}

function toggleModule(moduleId) {
  const module = document.getElementById(moduleId);
  if (module) {
    module.classList.toggle('active');
    
    // Close all direct modules when opening toggle module
    closeAllDirectModules();
    
    // Scroll to module when opening
    if (module.classList.contains('active')) {
      module.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function showDirectModule(moduleId) {
  // Map shortcut names to section IDs
  const moduleMap = {
    'Calculator': 'calculator',
    'StickyNotes': 'notes',
    'Calendar': 'calendar'
  };
  
  const sectionId = moduleMap[moduleId] || moduleId;
  if (sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      // Close all other direct modules first (exclusive display)
      closeAllDirectModules();
      
      // Open the selected module
      section.style.display = 'block';
      section.classList.add('active');
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      // Update toggle buttons
      updateToggleButtonsState(sectionId);
    }
  }
}

function updateToggleButtonsState(activeSectionId) {
  const toggleButtons = document.querySelectorAll('.toggle-button');
  toggleButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(activeSectionId)) {
      btn.classList.add('active');
    }
  });
}

function showSection(sectionId) {
  // Called from toggle buttons - use the same logic as showDirectModule
  const reverseMap = {
    'calculator': 'Calculator',
    'notes': 'StickyNotes',
    'calendar': 'Calendar'
  };
  showDirectModule(reverseMap[sectionId] || sectionId);
}

function checkAllTasksCompleted() {
  const tasks = document.querySelectorAll("#taskList li");
  const checkboxes = document.querySelectorAll("#taskList input[type='checkbox']");

  if (tasks.length === 0) return;

  let allChecked = true;

  checkboxes.forEach(cb => {
    if (!cb.checked) {
      allChecked = false;
    }
  });

  if (allChecked) {
    celebrateAllTasks();
  }
}

function celebrateAllTasks() {
  const duration = 3000;
  const end = Date.now() + duration;

  const colors = ['#ff6b6b','#4ecdc4','#45b7d1','#f9ca24','#f0932b','#eb4d4b'];

  function rain() {

    for (let i = 0; i < 8; i++) {

      const confetti = document.createElement("div");

      confetti.style.position = "fixed";
      confetti.style.left = Math.random() * 100 + "vw";
      confetti.style.top = "-10px";
      confetti.style.width = "8px";
      confetti.style.height = "8px";
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.zIndex = "9999";

      const fallDuration = Math.random() * 2 + 2;

      confetti.style.animation = `fallConfetti ${fallDuration}s linear`;

      document.body.appendChild(confetti);

      setTimeout(() => {
        confetti.remove();
      }, fallDuration * 1000);
    }

    if (Date.now() < end) {
      requestAnimationFrame(rain);
    }
  }

  rain();
}

// GO TO GAMES - Check completed tasks + assignments from localStorage
function goToGames() {
  const completedTasks = getCompletedTasksCount();
  const completedAssignments = getCompletedAssignmentsCount();
  const total = completedTasks + completedAssignments;

  // Save total to localStorage for games page to read
  localStorage.setItem('totalCompletedItems', total);

  // Updated: Need at least 5 completed items (tasks or assignments) OR 10 completed tasks
  if (total < 5) {
    alert("Complete at least 5 tasks/assignments to unlock Games! 🎯\n\nCompleted: " + total + "/5");
    return;
  }

  window.location.href = "ai shish/games.html";
}

// Count completed tasks from localStorage
function getCompletedTasksCount() {
  const tasks = JSON.parse(localStorage.getItem("tasks")) || [];
  return tasks.filter(t => t.completed).length;
}

// Count completed assignments from localStorage
function getCompletedAssignmentsCount() {
  const assignments = JSON.parse(localStorage.getItem("assignments")) || [];
  return assignments.filter(a => a.completed).length;
}

//hanggang dito langggggggggggggggggggggggggggggg

window.onload = function () {
  loadTasks();
  loadAssignments();
  loadNotifications(); // ⬅️ ADD MO TO
};

// Task completion - update localStorage when checkbox is clicked
function saveTaskProgress() {
  const tasks = getTasks();
  const completed = tasks.filter(t => t.completed).length;
  localStorage.setItem("completedTasks", completed);
}

// Assignment completion - update localStorage when checkbox is clicked
function saveAssignmentProgress() {
  const assignments = getAssignments();
  const completed = assignments.filter(a => a.completed).length;
  localStorage.setItem("completedAssignments", completed);
}