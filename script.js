const $ = (id) => document.getElementById(id);

(function () {
    const t = new Date(),
        y = t.getFullYear(),
        m = String(t.getMonth() + 1).padStart(2, '0'),
        d = String(t.getDate()).padStart(2, '0');
    $('month').value = `${y}-${m}`;
    $('date').value = `${y}-${m}-${d}`;
})(); // <-- No 'async' here

// Local storage for expenses
const localExpenses = {};

async function saveCapital() {
    const month = $('month').value,
        amount = Number($('capital').value || 0);
    if (!month) return alert('اختر الشهر');
    try {
        // Simulate a successful response locally
        await new Promise(resolve => setTimeout(resolve, 500)); // simulate delay
        // const res = await fetch('/api/capital', { ... }); // Remove this line
        // if (!res.ok) throw new Error('خطأ في الحفظ');
        $('capMsg').textContent = 'تم الحفظ';
        refresh();
    } catch (err) {
        $('capMsg').textContent = err.message;
    }
}

document.getElementById('saveCapital').addEventListener('click', saveCapital);

async function addExpense() {
    const month = $('month').value,
        date = $('date').value,
        category = $('category').value,
        amount = Number($('amount').value || 0),
        note = $('note').value;
    if (!month || !date || !category || !amount) return alert('اكمل الحقول');
    
    // Store locally
    if (!localExpenses[month]) localExpenses[month] = [];
    localExpenses[month].push({ date, category, amount, note });

    $('amount').value = '';
    $('note').value = '';
    refresh();
}

document.getElementById('addExpense').addEventListener('click', addExpense);

document.getElementById('export').addEventListener('click', () => {
    const month = $('month').value;
    if (!month) return alert('اختر الشهر');
    const list = localExpenses[month] || [];
    if (list.length === 0) return alert('لا توجد مصروفات لهذا الشهر');

    // Convert to CSV
    let csv = 'date,category,amount,note\n';
    list.forEach(e => {
        csv += `"${e.date}","${e.category}",${e.amount},"${e.note}"\n`;
    });

    // Add UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

async function refresh() {
    const month = $('month').value;
    if (!month) return;
    // Use only local data
    const list = localExpenses[month] || [];
    const tbody = $('list');
    tbody.innerHTML = '';
    let total = 0;
    for (const e of list) {
        total += Number(e.amount || 0);
        const div = document.createElement('div');
        div.innerHTML = `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #f0f2ff"><div>${e.date} · ${e.category}</div><div>${e.amount} ج.م</div></div>`;
        tbody.appendChild(div);
    }
    $('total').textContent = total;
    // Simulate summary: remaining = capital - total
    const capital = Number($('capital').value || 0);
    $('remaining').textContent = capital - total;
}

document.getElementById('month').addEventListener('change', refresh);

refresh();