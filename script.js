document.addEventListener('DOMContentLoaded', () => {
    const savedExpenses = localStorage.getItem('expenses');
    const shouldStartFresh = localStorage.getItem('startFresh') === 'true';
    let expenses = savedExpenses ? JSON.parse(savedExpenses) : [];
    let scannedReceipt = null;
    const monthlyBudget = 50000;
    const categories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Education', 'Healthcare', 'Miscellaneous'];

    if (expenses.length === 0 && !shouldStartFresh) {
        expenses = generateSeedData();
        saveExpenses();
    }

    const themeSwitch = document.getElementById('themeSwitch');
    const modal = document.getElementById('expenseModal');
    const addBtn = document.getElementById('addExpenseBtn');
    const ocrBtn = document.getElementById('ocrBtn');
    const chooseReceiptBtn = document.getElementById('chooseReceiptBtn');
    const receiptInput = document.getElementById('receiptInput');
    const receiptPreview = document.getElementById('receiptPreview');
    const receiptPlaceholder = document.getElementById('receiptPlaceholder');
    const useScanBtn = document.getElementById('useScanBtn');
    const clearScanBtn = document.getElementById('clearScanBtn');
    const emptyDataBtn = document.getElementById('emptyDataBtn');
    const clearDemoBtn = document.getElementById('clearDemoBtn');
    const closeBtn = document.querySelector('.close');
    const form = document.getElementById('expenseForm');
    const modalTitle = document.getElementById('modalTitle');
    const scanStatus = document.getElementById('scanStatus');
    const scanProgress = document.getElementById('scanProgress');

    let donutChartInstance = null;
    let lineChartInstance = null;

    initTheme();
    setDefaultDate();
    document.getElementById('currentDate').innerText = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    updateDashboard();

    themeSwitch.addEventListener('change', (event) => {
        document.body.classList.toggle('dark-mode', event.target.checked);
        updateCharts();
    });

    addBtn.addEventListener('click', () => openExpenseModal());
    ocrBtn.addEventListener('click', () => document.getElementById('receiptScanner').scrollIntoView({ behavior: 'smooth' }));
    chooseReceiptBtn.addEventListener('click', () => receiptInput.click());
    closeBtn.addEventListener('click', closeExpenseModal);
    clearScanBtn.addEventListener('click', resetScanner);
    emptyDataBtn.addEventListener('click', () => {
        expenses = [];
        localStorage.setItem('startFresh', 'true');
        saveExpenses();
        updateDashboard();
    });
    clearDemoBtn.addEventListener('click', () => {
        expenses = generateSeedData();
        localStorage.setItem('startFresh', 'false');
        saveExpenses();
        updateDashboard();
    });

    window.addEventListener('click', (event) => {
        if (event.target === modal) closeExpenseModal();
    });

    receiptInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        await scanReceipt(file);
    });

    useScanBtn.addEventListener('click', () => {
        if (!scannedReceipt) return;
        openExpenseModal(scannedReceipt);
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const newExpense = {
            id: Date.now(),
            amount: Number.parseFloat(document.getElementById('expAmount').value),
            description: document.getElementById('expDesc').value.trim(),
            category: document.getElementById('expCategory').value,
            date: document.getElementById('expDate').value,
            method: document.getElementById('expMethod').value
        };

        if (!Number.isFinite(newExpense.amount) || newExpense.amount <= 0 || !newExpense.description || !newExpense.date) {
            return;
        }

        expenses.unshift(newExpense);
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        saveExpenses();
        closeExpenseModal();
        updateDashboard();
    });

    function saveExpenses() {
        localStorage.setItem('expenses', JSON.stringify(expenses));
    }

    function updateDashboard() {
        renderTable();
        calculateKPIs();
        generateInsights();
        updateCharts();
    }

    function renderTable() {
        const tbody = document.getElementById('transactionBody');
        tbody.innerHTML = '';

        if (expenses.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'empty-state';
            td.textContent = 'No transactions yet. Add an expense or scan a receipt to begin.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        expenses.slice(0, 10).forEach((expense) => {
            const tr = document.createElement('tr');
            tr.appendChild(createCell(formatDate(expense.date)));
            tr.appendChild(createCell(expense.description));

            const categoryCell = createCell('');
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = expense.category;
            categoryCell.appendChild(badge);
            tr.appendChild(categoryCell);

            tr.appendChild(createCell(expense.method));
            tr.appendChild(createCell(formatCurrency(expense.amount), 'amount-cell'));

            const actionCell = createCell('');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn';
            deleteBtn.type = 'button';
            deleteBtn.setAttribute('aria-label', `Delete ${expense.description}`);
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.addEventListener('click', () => deleteExpense(expense.id));
            actionCell.appendChild(deleteBtn);
            tr.appendChild(actionCell);
            tbody.appendChild(tr);
        });
    }

    function createCell(text, className = '') {
        const td = document.createElement('td');
        td.textContent = text;
        if (className) td.className = className;
        return td;
    }

    function deleteExpense(id) {
        expenses = expenses.filter((expense) => expense.id !== id);
        saveExpenses();
        updateDashboard();
    }

    function calculateKPIs() {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

        const monthlyTotal = totalForMonth(currentYear, currentMonth);
        const previousMonthTotal = totalForMonth(previousMonthDate.getFullYear(), previousMonthDate.getMonth());
        const remaining = monthlyBudget - monthlyTotal;
        const progressPct = Math.min((monthlyTotal / monthlyBudget) * 100, 100);

        document.getElementById('monthlyTotal').innerText = formatCurrency(monthlyTotal);
        document.getElementById('remainingBudget').innerText = formatCurrency(remaining);
        document.getElementById('forecastTotal').innerText = formatCurrency(getForecastModel().nextMonth);

        const trend = document.getElementById('monthlyTrend');
        const diffPct = previousMonthTotal > 0 ? ((monthlyTotal - previousMonthTotal) / previousMonthTotal) * 100 : 0;
        trend.classList.toggle('positive', diffPct <= 0);
        trend.innerHTML = `<i class="fa-solid ${diffPct <= 0 ? 'fa-arrow-down' : 'fa-arrow-up'}"></i> ${Math.abs(diffPct).toFixed(0)}% vs last month`;

        const bar = document.getElementById('budgetProgress');
        bar.style.width = `${progressPct}%`;
        bar.style.background = progressPct > 90 ? 'var(--danger)' : progressPct > 75 ? '#f59e0b' : 'var(--accent)';

        const foodTotal = expenses
            .filter((expense) => expense.category === 'Food' && isCurrentMonth(expense.date))
            .reduce((sum, expense) => sum + expense.amount, 0);

        let score = 100;
        if (progressPct > 90) score -= 30;
        else if (progressPct > 75) score -= 15;
        if (foodTotal > monthlyBudget * 0.3) score -= 10;
        if (remaining < 0) score -= 20;
        score = Math.max(score, 0);

        document.getElementById('healthScore').innerText = `${score}/100`;
        document.getElementById('healthText').innerText = score > 80 ? 'Excellent' : score > 60 ? 'Good' : 'Needs Work';
    }

    function totalForMonth(year, month) {
        return expenses
            .filter((expense) => {
                const date = new Date(expense.date);
                return date.getMonth() === month && date.getFullYear() === year;
            })
            .reduce((sum, expense) => sum + expense.amount, 0);
    }

    function isCurrentMonth(dateValue) {
        const date = new Date(dateValue);
        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }

    function generateInsights() {
        const list = document.getElementById('aiInsightsList');
        list.innerHTML = '';
        const insights = [];
        const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        const catTotals = expenses.reduce((totals, expense) => {
            totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
            return totals;
        }, {});

        const highestCat = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
        if (highestCat) insights.push(`Highest spending is on <strong>${highestCat}</strong> at ${formatCurrency(catTotals[highestCat])}.`);

        const weekendSpends = expenses
            .filter((expense) => {
                const day = new Date(expense.date).getDay();
                return day === 0 || day === 6;
            })
            .reduce((sum, expense) => sum + expense.amount, 0);
        if (total > 0 && weekendSpends / total > 0.4) {
            insights.push('Weekend spending is above <strong>40%</strong> of tracked expenses.');
        }

        const subscriptions = expenses.filter((expense) => /(netflix|spotify|prime|aws|hotstar|youtube|subscription)/i.test(expense.description));
        if (subscriptions.length > 0) {
            insights.push(`Potential subscription detected: <strong>${escapeHtml(subscriptions[0].description)}</strong>.`);
        }

        renderAIInsights(insights, catTotals, total);
    }

    function renderAIInsights(baseInsights, catTotals, total) {
        const list = document.getElementById('aiInsightsList');
        const forecastList = document.getElementById('categoryForecastList');
        const model = getForecastModel();
        const risk = getBudgetRisk(model.currentMonthProjection);
        const anomaly = getLargestAnomaly();
        const topCategory = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])[0];
        const insights = [...baseInsights];

        document.getElementById('aiNextMonth').textContent = formatCurrency(model.nextMonth);
        document.getElementById('aiForecastRange').textContent = `${formatCurrency(model.low)} - ${formatCurrency(model.high)} expected range`;
        document.getElementById('aiConfidence').textContent = `${model.confidence} confidence`;
        document.getElementById('aiBudgetRisk').textContent = risk.label;
        document.getElementById('aiBudgetRisk').className = risk.className;
        document.getElementById('aiBudgetAdvice').textContent = risk.advice;
        document.getElementById('aiSafeSpend').textContent = formatCurrency(model.safeDailySpend);
        document.getElementById('aiAnomaly').textContent = anomaly ? formatCurrency(anomaly.amount) : 'None';
        document.getElementById('aiAnomalyText').textContent = anomaly
            ? `${anomaly.description} is ${anomaly.multiplier.toFixed(1)}x your usual transaction.`
            : 'No meaningful spending spikes detected yet.';

        if (model.nextMonth > monthlyBudget) {
            insights.push(`Next month is projected at <strong>${formatCurrency(model.nextMonth)}</strong>, above the current ${formatCurrency(monthlyBudget)} budget.`);
        } else {
            insights.push(`Next month is projected at <strong>${formatCurrency(model.nextMonth)}</strong>, within your current budget.`);
        }

        if (model.safeDailySpend > 0) {
            insights.push(`To stay on track this month, keep daily spending near <strong>${formatCurrency(model.safeDailySpend)}</strong>.`);
        }

        if (topCategory && total > 0 && catTotals[topCategory] / total > 0.35) {
            insights.push(`<strong>${topCategory}</strong> is concentrated at ${Math.round((catTotals[topCategory] / total) * 100)}% of all tracked spending.`);
        }

        if (anomaly) {
            insights.push(`Largest unusual item: <strong>${escapeHtml(anomaly.description)}</strong> on ${formatDate(anomaly.date)}.`);
        }

        if (insights.length === 0) {
            insights.push('Your spending looks balanced so far. Keep logging expenses for sharper insights.');
        }

        list.innerHTML = '';
        insights.slice(0, 7).forEach((text) => {
            const li = document.createElement('li');
            li.innerHTML = text;
            list.appendChild(li);
        });

        forecastList.innerHTML = '';
        getCategoryForecasts().forEach((item) => {
            const row = document.createElement('div');
            row.className = 'forecast-row';

            const label = document.createElement('span');
            label.textContent = item.category;

            const value = document.createElement('strong');
            value.textContent = formatCurrency(item.projected);

            const bar = document.createElement('div');
            bar.className = 'forecast-bar';
            const fill = document.createElement('i');
            fill.style.width = `${item.share}%`;
            bar.appendChild(fill);

            row.appendChild(label);
            row.appendChild(value);
            row.appendChild(bar);
            forecastList.appendChild(row);
        });
    }

    function getForecastModel() {
        const now = new Date();
        const currentMonthExpenses = expenses.filter((expense) => isCurrentMonth(expense.date));
        const currentTotal = currentMonthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        const dayOfMonth = Math.max(now.getDate(), 1);
        const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentMonthProjection = (currentTotal / dayOfMonth) * daysInCurrentMonth;
        const historicalMonthly = getHistoricalMonthTotals();
        const recentAverage = historicalMonthly.length
            ? historicalMonthly.reduce((sum, value) => sum + value, 0) / historicalMonthly.length
            : currentMonthProjection;
        const weightedProjection = (currentMonthProjection * 0.65) + (recentAverage * 0.35);
        const confidence = expenses.length >= 20 ? 'High' : expenses.length >= 8 ? 'Medium' : 'Low';
        const spread = confidence === 'High' ? 0.12 : confidence === 'Medium' ? 0.2 : 0.3;
        const remainingDays = Math.max(daysInCurrentMonth - dayOfMonth, 1);
        const safeDailySpend = Math.max((monthlyBudget - currentTotal) / remainingDays, 0);

        return {
            nextMonth: weightedProjection,
            currentMonthProjection,
            low: weightedProjection * (1 - spread),
            high: weightedProjection * (1 + spread),
            confidence,
            safeDailySpend
        };
    }

    function getHistoricalMonthTotals() {
        const now = new Date();
        const monthKeys = new Set();
        for (let i = 1; i <= 3; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthKeys.add(`${date.getFullYear()}-${date.getMonth()}`);
        }

        return [...monthKeys].map((key) => {
            const [year, month] = key.split('-').map(Number);
            return totalForMonth(year, month);
        }).filter((value) => value > 0);
    }

    function getBudgetRisk(projectedSpend) {
        const ratio = projectedSpend / monthlyBudget;
        if (ratio >= 1.05) {
            return {
                label: 'High',
                className: 'risk-high',
                advice: 'Projected spending is above budget. Reduce flexible categories first.'
            };
        }
        if (ratio >= 0.85) {
            return {
                label: 'Medium',
                className: 'risk-medium',
                advice: 'You are close to budget. Keep an eye on daily spending.'
            };
        }
        return {
            label: 'Low',
            className: 'risk-low',
            advice: 'Current pace leaves room inside the monthly budget.'
        };
    }

    function getCategoryForecasts() {
        const model = getForecastModel();
        const totals = categories.map((category) => {
            const amount = expenses
                .filter((expense) => expense.category === category)
                .reduce((sum, expense) => sum + expense.amount, 0);
            return { category, amount };
        }).filter((item) => item.amount > 0);
        const grandTotal = totals.reduce((sum, item) => sum + item.amount, 0) || 1;

        return totals
            .map((item) => {
                const projected = model.nextMonth * (item.amount / grandTotal);
                return {
                    category: item.category,
                    projected,
                    share: Math.max(Math.min((projected / model.nextMonth) * 100, 100), 4)
                };
            })
            .sort((a, b) => b.projected - a.projected)
            .slice(0, 6);
    }

    function getLargestAnomaly() {
        if (expenses.length < 5) return null;
        const average = expenses.reduce((sum, expense) => sum + expense.amount, 0) / expenses.length;
        const candidate = expenses
            .filter((expense) => expense.amount > average * 1.8 && expense.amount > 1000)
            .sort((a, b) => b.amount - a.amount)[0];
        if (!candidate) return null;
        return { ...candidate, multiplier: candidate.amount / average };
    }

    async function scanReceipt(file) {
        resetScanner(false);
        const imageUrl = URL.createObjectURL(file);
        receiptPreview.src = imageUrl;
        receiptPreview.style.display = 'block';
        receiptPlaceholder.style.display = 'none';
        setScannerBusy(true);

        if (!window.Tesseract) {
            scanStatus.textContent = 'OCR library could not load. Check your internet connection and try again.';
            setScannerBusy(false);
            return;
        }

        try {
            const result = await Tesseract.recognize(file, 'eng', {
                logger: (message) => {
                    if (message.status) {
                        scanStatus.textContent = titleCase(message.status);
                    }
                    if (message.progress) {
                        scanProgress.style.width = `${Math.round(message.progress * 100)}%`;
                    }
                }
            });
            const parsed = parseReceiptText(result.data.text);
            scannedReceipt = parsed;
            renderScanResult(parsed);
            scanStatus.textContent = parsed.amount ? 'Receipt scanned. Review the fields before saving.' : 'Scan complete, but total was not found.';
            useScanBtn.disabled = !parsed.amount;
            clearScanBtn.disabled = false;
        } catch (error) {
            console.error(error);
            scanStatus.textContent = 'Could not read this receipt. Try a sharper, well-lit photo.';
            useScanBtn.disabled = true;
            clearScanBtn.disabled = false;
        } finally {
            setScannerBusy(false);
            scanProgress.style.width = '100%';
        }
    }

    function parseReceiptText(text) {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        const joined = lines.join(' ');
        const amount = extractTotal(lines);
        const date = extractDate(joined);
        const merchant = extractMerchant(lines);
        const description = merchant ? `${merchant} Receipt` : 'Scanned Receipt';
        const category = inferCategory(`${merchant} ${joined}`);

        return {
            amount,
            description,
            category,
            date: date || new Date().toISOString().split('T')[0],
            method: inferPaymentMethod(joined),
            rawText: text
        };
    }

    function extractTotal(lines) {
        const moneyPattern = /(?:rs\.?|inr|₹|\$)?\s*([0-9]{1,3}(?:[, ]?[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/gi;
        const priorityWords = /(grand total|net total|amount payable|balance due|total due|total|subtotal)/i;
        const skipWords = /(tax|gst|cgst|sgst|igst|change|cash|card|qty|quantity|mrp|discount)/i;

        const candidates = [];
        lines.forEach((line, index) => {
            const matches = [...line.matchAll(moneyPattern)];
            matches.forEach((match) => {
                const value = Number.parseFloat(match[1].replace(/[, ]/g, ''));
                if (!Number.isFinite(value) || value <= 0) return;
                const priority = priorityWords.test(line) ? 20 : 0;
                const penalty = skipWords.test(line) && !priorityWords.test(line) ? 8 : 0;
                candidates.push({ value, score: priority - penalty + index / 100 });
            });
        });

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.score - a.score || b.value - a.value);
        return candidates[0].value;
    }

    function extractDate(text) {
        const patterns = [
            /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/,
            /\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (!match) continue;
            let year;
            let month;
            let day;
            if (match[1].length === 4) {
                year = Number(match[1]);
                month = Number(match[2]);
                day = Number(match[3]);
            } else {
                day = Number(match[1]);
                month = Number(match[2]);
                year = Number(match[3]);
            }
            if (year < 100) year += 2000;
            const date = new Date(year, month - 1, day);
            if (!Number.isNaN(date.getTime())) return date.toISOString().split('T')[0];
        }
        return null;
    }

    function extractMerchant(lines) {
        const ignored = /(invoice|receipt|tax|gst|phone|mobile|address|cashier|bill|date|time|total)/i;
        const merchantLine = lines.find((line) => line.length > 2 && line.length < 45 && !ignored.test(line));
        return merchantLine ? titleCase(merchantLine.replace(/[^a-z0-9 &'.-]/gi, '').trim()) : '';
    }

    function inferCategory(text) {
        const lower = text.toLowerCase();
        const rules = [
            ['Food', /(restaurant|cafe|coffee|pizza|burger|grocery|grocer|fresh|mart|supermarket|food|bakery|dining|swiggy|zomato)/],
            ['Transport', /(fuel|petrol|diesel|uber|ola|metro|bus|train|parking|toll|cab|taxi)/],
            ['Shopping', /(mall|store|fashion|apparel|clothes|electronics|amazon|flipkart|myntra|retail)/],
            ['Entertainment', /(cinema|movie|pvr|inox|netflix|spotify|prime|game|theatre)/],
            ['Bills', /(electricity|water|gas|broadband|wifi|internet|mobile|recharge|utility)/],
            ['Education', /(book|school|college|course|tuition|exam|stationery)/],
            ['Healthcare', /(pharmacy|medical|hospital|clinic|doctor|medicine|health)/]
        ];
        return rules.find(([, pattern]) => pattern.test(lower))?.[0] || 'Miscellaneous';
    }

    function inferPaymentMethod(text) {
        if (/upi|gpay|phonepe|paytm/i.test(text)) return 'UPI';
        if (/debit/i.test(text)) return 'Debit Card';
        if (/credit|visa|mastercard|card/i.test(text)) return 'Credit Card';
        return 'Cash';
    }

    function renderScanResult(receipt) {
        document.getElementById('scanMerchant').textContent = receipt.description.replace(/ Receipt$/, '') || '-';
        document.getElementById('scanTotal').textContent = receipt.amount ? formatCurrency(receipt.amount) : '-';
        document.getElementById('scanDate').textContent = receipt.date ? formatDate(receipt.date) : '-';
        document.getElementById('scanCategory').textContent = receipt.category || '-';
    }

    function resetScanner(clearFile = true) {
        scannedReceipt = null;
        if (clearFile) receiptInput.value = '';
        receiptPreview.removeAttribute('src');
        receiptPreview.style.display = 'none';
        receiptPlaceholder.style.display = 'flex';
        scanStatus.textContent = 'Ready to scan';
        scanProgress.style.width = '0%';
        ['scanMerchant', 'scanTotal', 'scanDate', 'scanCategory'].forEach((id) => {
            document.getElementById(id).textContent = '-';
        });
        useScanBtn.disabled = true;
        clearScanBtn.disabled = true;
    }

    function setScannerBusy(isBusy) {
        chooseReceiptBtn.disabled = isBusy;
        ocrBtn.disabled = isBusy;
        chooseReceiptBtn.innerHTML = isBusy
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Scanning'
            : '<i class="fa-solid fa-upload"></i> Upload Receipt';
        ocrBtn.innerHTML = isBusy
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Scanning'
            : '<i class="fa-solid fa-receipt"></i> Scan Receipt';
    }

    function openExpenseModal(prefill = null) {
        form.reset();
        modalTitle.textContent = prefill ? 'Review Scanned Expense' : 'Add New Expense';
        setDefaultDate();
        if (prefill) {
            document.getElementById('expAmount').value = prefill.amount || '';
            document.getElementById('expDesc').value = prefill.description || '';
            document.getElementById('expCategory').value = categories.includes(prefill.category) ? prefill.category : 'Miscellaneous';
            document.getElementById('expDate').value = prefill.date || new Date().toISOString().split('T')[0];
            document.getElementById('expMethod').value = prefill.method || 'Cash';
        }
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('expAmount').focus();
    }

    function closeExpenseModal() {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        form.reset();
        modalTitle.textContent = 'Add New Expense';
        setDefaultDate();
    }

    function updateCharts() {
        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#f8fafc' : '#1a1a1a';
        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        const catTotals = categories.reduce((totals, category) => {
            const total = expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0);
            if (total > 0) totals[category] = total;
            return totals;
        }, {});

        const last7Days = [...Array(7)].map((_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - index);
            return date.toISOString().split('T')[0];
        }).reverse();

        const dailyTotals = last7Days.map((date) => {
            return expenses.filter((expense) => expense.date === date).reduce((sum, expense) => sum + expense.amount, 0);
        });

        if (donutChartInstance) donutChartInstance.destroy();
        donutChartInstance = new Chart(document.getElementById('donutChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: Object.keys(catTotals).length ? Object.keys(catTotals) : ['No data'],
                datasets: [{
                    data: Object.values(catTotals).length ? Object.values(catTotals) : [1],
                    backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });

        if (lineChartInstance) lineChartInstance.destroy();
        lineChartInstance = new Chart(document.getElementById('lineChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: last7Days.map((date) => date.slice(5)),
                datasets: [{
                    label: 'Daily Spend (₹)',
                    data: dailyTotals,
                    borderColor: '#4f46e5',
                    tension: 0.35,
                    fill: true,
                    backgroundColor: 'rgba(79, 70, 229, 0.18)',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    function initTheme() {
        themeSwitch.checked = document.body.classList.contains('dark-mode');
    }

    function setDefaultDate() {
        document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function formatDate(value) {
        return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function titleCase(value) {
        return value
            .toLowerCase()
            .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    }

    function escapeHtml(value) {
        const span = document.createElement('span');
        span.textContent = value;
        return span.innerHTML;
    }

    function generateSeedData() {
        const methods = ['Credit Card', 'UPI', 'Debit Card'];
        const descriptions = {
            Food: ['Reliance Fresh', 'Cafe Coffee Day', 'Lunch at Bistro', 'BigBasket Groceries'],
            Transport: ['Metro Card Recharge', 'Uber Ride', 'Fuel Station', 'Airport Parking'],
            Shopping: ['Amazon Order', 'Myntra Apparel', 'Electronics Store', 'Home Supplies'],
            Entertainment: ['PVR Cinemas', 'Spotify Subscription', 'Prime Video', 'Concert Tickets'],
            Bills: ['Electricity Bill', 'Mobile Recharge', 'Broadband Bill', 'Gas Utility']
        };
        const dummy = [];
        for (let i = 0; i < 25; i++) {
            const category = Object.keys(descriptions)[Math.floor(Math.random() * Object.keys(descriptions).length)];
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 45));
            dummy.push({
                id: Date.now() + i,
                amount: Math.floor(Math.random() * 2400) + 120,
                description: descriptions[category][Math.floor(Math.random() * descriptions[category].length)],
                category,
                date: date.toISOString().split('T')[0],
                method: methods[Math.floor(Math.random() * methods.length)]
            });
        }
        dummy.push({
            id: 999,
            amount: 649,
            description: 'Netflix Subscription',
            category: 'Entertainment',
            date: new Date().toISOString().split('T')[0],
            method: 'Credit Card'
        });
        return dummy.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
});
