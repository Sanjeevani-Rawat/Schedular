
(function () {
    "use strict";

    var LS_SUBJECTS = "scheduler_subjects_v2";
    var LS_MONTHS_INDEX = "scheduler_months_index_v2";
    var LS_MONTH_PREFIX = "scheduler_month_v2_";

    var DEFAULT_SUBJECTS = [];

    var WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    var subjects = [];
    var MIN_MONTH = new Date(2026, 8, 1);  // September 2026
    var MAX_MONTH = new Date(2026, 11, 1); // December 2026
    var monthData = {}; // dateKey -> { values: {subjId: num|"done"|"x"|null}, notes: "", tag: "none" }

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function monthKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
    function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
    function dateKey(y, m, day) { return y + "-" + pad(m + 1) + "-" + pad(day); }
    function uid() { return "s" + Math.random().toString(36).slice(2, 9); }
    function todayKey() { var t = new Date(); return dateKey(t.getFullYear(), t.getMonth(), t.getDate()); }
    function clampMonth(d) {
        var m = new Date(d.getFullYear(), d.getMonth(), 1);
        if (m < MIN_MONTH) return new Date(MIN_MONTH.getFullYear(), MIN_MONTH.getMonth(), 1);
        if (m > MAX_MONTH) return new Date(MAX_MONTH.getFullYear(), MAX_MONTH.getMonth(), 1);
        return m;
    }

    var current = clampMonth(new Date());

    function loadJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) { return fallback; }
    }
    function saveJSON(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage unavailable */ }
    }

    function loadSubjects() {
        subjects = loadJSON(LS_SUBJECTS, null) || DEFAULT_SUBJECTS.slice();
    }
    function saveSubjects() { saveJSON(LS_SUBJECTS, subjects); }

    function blankMonthData(d) {
        var data = {};
        var n = daysInMonth(d);
        for (var day = 1; day <= n; day++) {
            var key = dateKey(d.getFullYear(), d.getMonth(), day);
            data[key] = { values: {}, notes: "", tag: "none", topics: {} };
        }
        return data;
    }

    function loadMonth(d) {
        var key = monthKey(d);
        var stored = loadJSON(LS_MONTH_PREFIX + key, null);
        var blank = blankMonthData(d);
        if (!stored) { monthData = blank; return; }
        // merge: keep stored day entries, fill missing days (in case month changed) with blanks
        var merged = {};
        for (var k in blank) {
            merged[k] = stored[k] ? stored[k] : blank[k];
            if (!merged[k].values) merged[k].values = {};
            if (typeof merged[k].notes !== "string") merged[k].notes = "";
            if (!merged[k].tag) merged[k].tag = "none";
            if (!merged[k].topics) merged[k].topics = {};
        }
        monthData = merged;
    }

    function saveMonth() {
        var key = monthKey(current);
        saveJSON(LS_MONTH_PREFIX + key, monthData);
        var idx = loadJSON(LS_MONTHS_INDEX, []);
        if (idx.indexOf(key) === -1) { idx.push(key); idx.sort(); saveJSON(LS_MONTHS_INDEX, idx); }
        renderMonthJump();
    }

    function ensureMonthIndexed() {
        var idx = loadJSON(LS_MONTHS_INDEX, []);
        var key = monthKey(current);
        if (idx.indexOf(key) === -1) { idx.push(key); idx.sort(); saveJSON(LS_MONTHS_INDEX, idx); }
    }

    // ---------- rendering ----------

    function renderMonthLabel() {
        document.getElementById("monthLabel").textContent = MONTH_NAMES[current.getMonth()] + " " + current.getFullYear();
    }

    function updateClock() {
        var now = new Date();
        var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        var dateStr = days[now.getDay()] + ", " + now.getDate() + " " + MONTH_NAMES[now.getMonth()] + " " + now.getFullYear();
        var h = now.getHours(), mnt = pad(now.getMinutes()), sec = pad(now.getSeconds());
        var ampm = h >= 12 ? "PM" : "AM";
        var h12 = h % 12; if (h12 === 0) h12 = 12;
        var timeStr = h12 + ":" + mnt + ":" + sec + " " + ampm;
        var el = document.getElementById("nowClock");
        if (el) el.textContent = dateStr + " \u00b7 " + timeStr;
    }
    function startClock() {
        updateClock();
        setInterval(updateClock, 1000);
    }

    function renderMonthJump() {
        var sel = document.getElementById("monthJump");
        var curKey = monthKey(current);
        sel.innerHTML = "";
        for (var mm = MIN_MONTH.getMonth(); mm <= MAX_MONTH.getMonth(); mm++) {
            var d = new Date(MIN_MONTH.getFullYear(), mm, 1);
            var k = monthKey(d);
            var label = MONTH_NAMES[mm].slice(0, 3) + " " + d.getFullYear();
            var opt = document.createElement("option");
            opt.value = k; opt.textContent = label;
            if (k === curKey) opt.selected = true;
            sel.appendChild(opt);
        }
    }

    function updateNavButtons() {
        var prevBtn = document.getElementById("prevMonth");
        var nextBtn = document.getElementById("nextMonth");
        prevBtn.disabled = (current.getFullYear() === MIN_MONTH.getFullYear() && current.getMonth() === MIN_MONTH.getMonth());
        nextBtn.disabled = (current.getFullYear() === MAX_MONTH.getFullYear() && current.getMonth() === MAX_MONTH.getMonth());
    }

    function subjectHoursSubjects() { return subjects.filter(function (s) { return s.type === "hours"; }); }

    function dayTotal(key) {
        var entry = monthData[key];
        if (!entry) return 0;
        var total = 0;
        subjectHoursSubjects().forEach(function (s) {
            var v = entry.values[s.id];
            if (typeof v === "number") total += v;
        });
        return total;
    }

    function renderTableHead() {
        var thead = document.querySelector("#schedTable thead");
        var row1 = thead.children[0];
        var row2 = thead.children[1];
        // clear beyond the first two sticky columns
        while (row1.children.length > 2) row1.removeChild(row1.lastChild);
        while (row2.children.length > 2) row2.removeChild(row2.lastChild);

        subjects.forEach(function (s) {
            var th = document.createElement("th");
            th.textContent = s.name;
            row1.appendChild(th);

            var sub = document.createElement("th");
            sub.textContent = s.type === "hours" ? (s.time + (s.target ? " \u00b7 " + s.target + "h" : "")) : s.time;
            row2.appendChild(sub);
        });

        var thTotal = document.createElement("th"); thTotal.textContent = "Study Hrs";
        row1.appendChild(thTotal);
        var subTotal = document.createElement("th");
        var dailyTargetSum = 0;
        subjectHoursSubjects().forEach(function (s) { dailyTargetSum += (s.target || 0); });
        subTotal.textContent = round1(dailyTargetSum) + "h total";
        row2.appendChild(subTotal);

        var thNotes = document.createElement("th"); thNotes.textContent = "Notes";
        row1.appendChild(thNotes);
        var subNotes = document.createElement("th"); subNotes.textContent = "";
        row2.appendChild(subNotes);
    }

    function cycleCheckState(s) {
        if (s === "done") return "x";
        if (s === "x") return null;
        return "done";
    }
    function checkLabel(s) {
        if (s === "done") return "Done";
        if (s === "x") return "Missed";
        return "\u2014";
    }

    function renderTableBody() {
        var tbody = document.getElementById("tableBody");
        tbody.innerHTML = "";
        var n = daysInMonth(current);
        var y = current.getFullYear(), m = current.getMonth();

        for (var day = 1; day <= n; day++) {
            var key = dateKey(y, m, day);
            var entry = monthData[key];
            var dow = new Date(y, m, day).getDay();
            var tr = document.createElement("tr");
            tr.dataset.key = key;
            if (dow === 0 || dow === 6) tr.classList.add("weekend");
            if (entry.tag === "exam") tr.classList.add("tag-exam");
            if (entry.tag === "off") tr.classList.add("tag-off");
            if (key === todayKey()) tr.classList.add("today");

            var tdDay = document.createElement("td");
            tdDay.className = "col-day";
            tdDay.textContent = WEEKDAY_SHORT[dow];
            tr.appendChild(tdDay);

            var tdDate = document.createElement("td");
            tdDate.className = "col-date";
            var wrap = document.createElement("div"); wrap.className = "datecell";
            var num = document.createElement("span"); num.className = "datenum"; num.textContent = pad(day);
            var dot = document.createElement("button");
            dot.className = "tag-dot"; dot.type = "button";
            dot.dataset.tag = entry.tag;
            dot.title = "Mark day: none / exam / off";
            dot.addEventListener("click", function (k) {
                return function () {
                    var e = monthData[k];
                    e.tag = e.tag === "none" ? "exam" : (e.tag === "exam" ? "off" : "none");
                    saveMonth();
                    renderTableBody();
                    renderFoot();
                    renderStats();
                };
            }(key));
            wrap.appendChild(num); wrap.appendChild(dot);
            tdDate.appendChild(wrap);
            tr.appendChild(tdDate);

            subjects.forEach(function (s) {
                var td = document.createElement("td");
                if (s.type === "hours") {
                    td.className = "cell-hours";
                    var input = document.createElement("input");
                    input.type = "number"; input.step = "0.5"; input.min = "0"; input.placeholder = "\u2013";
                    var v = entry.values[s.id];
                    input.value = (typeof v === "number") ? v : "";
                    input.addEventListener("change", function (k, sid) {
                        return function (ev) {
                            var raw = ev.target.value;
                            var e = monthData[k];
                            e.values[sid] = raw === "" ? null : parseFloat(raw);
                            saveMonth();
                            renderTotalsRow();
                            renderFoot();
                            renderStats();
                        };
                    }(key, s.id));
                    td.appendChild(input);
                } else {
                    var btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "chip-toggle";
                    var state = entry.values[s.id] || null;
                    btn.dataset.state = state || "";
                    btn.textContent = checkLabel(state);
                    btn.addEventListener("click", function (k, sid) {
                        return function (ev) {
                            var e = monthData[k];
                            var cur = e.values[sid] || null;
                            var next = cycleCheckState(cur);
                            e.values[sid] = next;
                            saveMonth();
                            renderTableBody();
                            renderFoot();
                            renderStats();
                        };
                    }(key, s.id));
                    td.appendChild(btn);
                }
                tr.appendChild(td);
            });

            var tdTotal = document.createElement("td");
            tdTotal.className = "cell-total";
            tdTotal.textContent = dayTotal(key) ? dayTotal(key) : "\u2013";
            tr.appendChild(tdTotal);

            var tdNotes = document.createElement("td");
            tdNotes.className = "col-notes";
            var noteInput = document.createElement("input");
            noteInput.type = "text"; noteInput.placeholder = "notes\u2026";
            noteInput.value = entry.notes || "";
            noteInput.addEventListener("change", function (k) {
                return function (ev) {
                    monthData[k].notes = ev.target.value;
                    saveMonth();
                };
            }(key));
            tdNotes.appendChild(noteInput);
            tr.appendChild(tdNotes);

            tbody.appendChild(tr);
        }
    }

    function renderTotalsRow() {
        var tbody = document.getElementById("tableBody");
        Array.prototype.forEach.call(tbody.children, function (tr) {
            var key = tr.dataset.key;
            var totalCell = tr.querySelector(".cell-total");
            if (totalCell) totalCell.textContent = dayTotal(key) ? dayTotal(key) : "\u2013";
        });
    }

    function renderFoot() {
        var tfoot = document.getElementById("tableFoot");
        tfoot.innerHTML = "";
        var n = daysInMonth(current);

        var achievedRow = document.createElement("tr"); achievedRow.className = "achieved";
        var achLabelDay = document.createElement("td"); achLabelDay.className = "col-day"; achLabelDay.textContent = "";
        var achLabelDate = document.createElement("td"); achLabelDate.className = "col-date"; achLabelDate.textContent = "Achieved";
        achievedRow.appendChild(achLabelDay); achievedRow.appendChild(achLabelDate);

        var targetRow = document.createElement("tr"); targetRow.className = "target";
        var tgLabelDay = document.createElement("td"); tgLabelDay.className = "col-day"; tgLabelDay.textContent = "";
        var tgLabelDate = document.createElement("td"); tgLabelDate.className = "col-date"; tgLabelDate.textContent = "Target";
        targetRow.appendChild(tgLabelDay); targetRow.appendChild(tgLabelDate);

        var grandAchieved = 0, grandTarget = 0;

        subjects.forEach(function (s) {
            var achCell = document.createElement("td");
            var tgCell = document.createElement("td");
            if (s.type === "hours") {
                var sum = 0;
                for (var k in monthData) { var v = monthData[k].values[s.id]; if (typeof v === "number") sum += v; }
                var tgt = s.target * n;
                achCell.textContent = sum;
                tgCell.textContent = tgt;
                grandAchieved += sum; grandTarget += tgt;
            } else {
                var done = 0, total = 0;
                for (var k2 in monthData) { var vv = monthData[k2].values[s.id]; if (vv === "done") done++; if (vv) total++; }
                achCell.textContent = done + " done";
                tgCell.textContent = n + " days";
            }
            achievedRow.appendChild(achCell);
            targetRow.appendChild(tgCell);
        });

        var achTotal = document.createElement("td"); achTotal.textContent = round1(grandAchieved) + "h";
        var tgTotal = document.createElement("td"); tgTotal.textContent = round1(grandTarget) + "h";
        achievedRow.appendChild(achTotal);
        targetRow.appendChild(tgTotal);

        var achNotes = document.createElement("td"); achNotes.textContent = "";
        var tgNotes = document.createElement("td"); tgNotes.textContent = "";
        achievedRow.appendChild(achNotes);
        targetRow.appendChild(tgNotes);

        tfoot.appendChild(achievedRow);
        tfoot.appendChild(targetRow);
    }

    function round1(n) { return Math.round(n * 10) / 10; }

    function renderStats() {
        var n = daysInMonth(current);
        var grandAchieved = 0, grandTarget = 0, loggedDays = 0;
        for (var k in monthData) {
            var t = dayTotal(k);
            if (t > 0) loggedDays++;
            grandAchieved += t;
        }
        subjectHoursSubjects().forEach(function (s) { grandTarget += s.target * n; });
        var pct = grandTarget > 0 ? Math.round((grandAchieved / grandTarget) * 100) : 0;
        var avg = loggedDays > 0 ? round1(grandAchieved / loggedDays) : 0;

        var stats = [
            { num: round1(grandAchieved) + "h", label: "Hours logged this month" },
            { num: round1(grandTarget) + "h", label: "Target for the month" },
            { num: pct + "%", label: "Of monthly target reached" },
            { num: loggedDays + " / " + n, label: "Days with study logged" },
            { num: avg + "h", label: "Average on logged days" }
        ];

        var strip = document.getElementById("statStrip");
        strip.innerHTML = "";
        stats.forEach(function (s, i) {
            var div = document.createElement("div");
            div.className = "stat" + (i < 3 ? " accent" : "");
            div.innerHTML = '<div class="num">' + s.num + '</div><div class="label">' + s.label + '</div>';
            strip.appendChild(div);
        });
    }

    // ---------- subjects panel ----------

    function renderSubjectPanel() {
        document.getElementById("subjCount").textContent = subjects.length + " subject" + (subjects.length === 1 ? "" : "s");
        var list = document.getElementById("subjectList");
        list.innerHTML = "";
        subjects.forEach(function (s, i) {
            var row = document.createElement("div");
            row.className = "subj-row";

            var nameInput = document.createElement("input");
            nameInput.type = "text"; nameInput.value = s.name;
            nameInput.addEventListener("change", function (ev) { s.name = ev.target.value || s.name; commitSubjects(); });

            var timeInput = document.createElement("input");
            timeInput.type = "text"; timeInput.value = s.time; timeInput.placeholder = "e.g. 8:00 \u2013 10:30";
            timeInput.addEventListener("change", function (ev) { s.time = ev.target.value; commitSubjects(); });

            var targetInput = document.createElement("input");
            targetInput.type = "number"; targetInput.step = "0.5"; targetInput.min = "0"; targetInput.value = s.target;
            targetInput.disabled = s.type === "check";
            targetInput.addEventListener("change", function (ev) { s.target = parseFloat(ev.target.value) || 0; commitSubjects(); });

            var typeSelect = document.createElement("select");
            ["hours", "check"].forEach(function (t) {
                var opt = document.createElement("option");
                opt.value = t; opt.textContent = t === "hours" ? "Hours logged" : "Done / missed";
                if (s.type === t) opt.selected = true;
                typeSelect.appendChild(opt);
            });
            typeSelect.addEventListener("change", function (ev) { s.type = ev.target.value; renderSubjectPanel(); commitSubjects(); });

            var delBtn = document.createElement("button");
            delBtn.className = "icon-btn"; delBtn.type = "button"; delBtn.innerHTML = "&#10005;";
            delBtn.title = "Remove subject";
            delBtn.addEventListener("click", function () {
                if (confirm('Remove "' + s.name + '" from the schedule?')) {
                    subjects = subjects.filter(function (x) { return x.id !== s.id; });
                    commitSubjects();
                    renderSubjectPanel();
                    fullRenderTable();
                }
            });

            row.appendChild(nameInput);
            row.appendChild(timeInput);
            row.appendChild(targetInput);
            row.appendChild(typeSelect);
            row.appendChild(delBtn);
            list.appendChild(row);
        });
    }

    // ---------- topics covered table ----------

    function renderTopics() {
        var shell = document.getElementById("topicsShell");
        var hint = document.getElementById("topicsEmptyHint");
        if (subjects.length === 0) {
            shell.style.display = "none";
            hint.style.display = "block";
            return;
        }
        shell.style.display = "";
        hint.style.display = "none";
        renderTopicsHead();
        renderTopicsBody();
    }

    function renderTopicsHead() {
        var headRow = document.getElementById("topicsHeadRow");
        var barRow = document.getElementById("topicsBarRow");
        while (headRow.children.length > 2) headRow.removeChild(headRow.lastChild);
        while (barRow.children.length > 2) barRow.removeChild(barRow.lastChild);

        subjects.forEach(function (s) {
            var th = document.createElement("th");
            th.textContent = s.name;
            headRow.appendChild(th);
        });

        var bar = document.createElement("th");
        bar.textContent = "Topics Covered";
        bar.colSpan = subjects.length;
        barRow.appendChild(bar);
    }

    function renderTopicsBody() {
        var tbody = document.getElementById("topicsBody");
        tbody.innerHTML = "";
        var n = daysInMonth(current);
        var y = current.getFullYear(), m = current.getMonth();

        for (var day = 1; day <= n; day++) {
            var key = dateKey(y, m, day);
            var entry = monthData[key];
            var dow = new Date(y, m, day).getDay();
            var tr = document.createElement("tr");
            if (dow === 0 || dow === 6) tr.classList.add("weekend");
            if (entry.tag === "exam") tr.classList.add("tag-exam");
            if (entry.tag === "off") tr.classList.add("tag-off");
            if (key === todayKey()) tr.classList.add("today");

            var tdDay = document.createElement("td");
            tdDay.className = "col-day";
            tdDay.textContent = WEEKDAY_SHORT[dow];
            tr.appendChild(tdDay);

            var tdDate = document.createElement("td");
            tdDate.className = "col-date";
            tdDate.textContent = pad(day);
            tr.appendChild(tdDate);

            subjects.forEach(function (s) {
                var td = document.createElement("td");
                td.className = "col-topic";
                var input = document.createElement("input");
                input.type = "text";
                input.placeholder = "topic\u2026";
                input.value = (entry.topics && entry.topics[s.id]) ? entry.topics[s.id] : "";
                input.addEventListener("change", function (k, sid) {
                    return function (ev) {
                        var e = monthData[k];
                        if (!e.topics) e.topics = {};
                        e.topics[sid] = ev.target.value;
                        saveMonth();
                    };
                }(key, s.id));
                td.appendChild(input);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }
    }

    function commitSubjects() {
        saveSubjects();
        renderTableHead();
        renderTableBody();
        renderFoot();
        renderStats();
        renderTopics();
    }

    document.getElementById("addSubjectBtn").addEventListener("click", function () {
        subjects.push({ id: uid(), name: "New subject", time: "", target: 1, type: "hours" });
        commitSubjects();
        renderSubjectPanel();
    });

    document.getElementById("subjectPanelHead").addEventListener("click", function () {
        document.getElementById("subjectPanel").classList.toggle("open");
    });

    // ---------- month navigation ----------

    function goToMonth(d) {
        current = clampMonth(d);
        loadMonth(current);
        ensureMonthIndexed();
        fullRenderTable();
        renderMonthLabel();
        renderMonthJump();
        updateNavButtons();
    }

    document.getElementById("prevMonth").addEventListener("click", function () {
        goToMonth(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    });
    document.getElementById("nextMonth").addEventListener("click", function () {
        goToMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    });
    document.getElementById("monthJump").addEventListener("change", function (ev) {
        var parts = ev.target.value.split("-");
        goToMonth(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
    });

    function fullRenderTable() {
        renderTableHead();
        renderTableBody();
        renderFoot();
        renderStats();
        renderTopics();
    }

    // ---------- init ----------

    loadSubjects();
    loadMonth(current);
    ensureMonthIndexed();
    renderMonthLabel();
    renderSubjectPanel();
    if (subjects.length === 0) { document.getElementById("subjectPanel").classList.add("open"); }
    fullRenderTable();
    renderMonthJump();
    updateNavButtons();
    startClock();

})();
