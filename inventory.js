// Inventory System - Database-Backed JavaScript
// ===============================================

// ========== API Helper Functions ==========
async function apiCall(action, data = null, method = 'POST') {
    try {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        // For file uploads
        if (data instanceof FormData) {
            delete options.headers['Content-Type'];
            options.body = data;
        }
        
        const response = await fetch(`api.php?action=${action}`, options);
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || 'API error');
        }
        
        return result.data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ========== Helpers ==========
function nowISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function todayYMD() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ========== Data Fetching Functions ==========
let cachedTools = [];
let cachedEmployees = [];
let cachedLogs = [];

async function fetchTools() {
    try {
        cachedTools = await apiCall('get_tools');
        return cachedTools;
    } catch (error) {
        console.error('Error fetching tools:', error);
        return [];
    }
}

async function fetchEmployees() {
    try {
        cachedEmployees = await apiCall('get_employees');
        return cachedEmployees;
    } catch (error) {
        console.error('Error fetching employees:', error);
        return [];
    }
}

async function fetchLogs() {
    try {
        cachedLogs = await apiCall('get_logs');
        return cachedLogs;
    } catch (error) {
        console.error('Error fetching logs:', error);
        return [];
    }
}

function getTools() { return cachedTools; }
function getEmployees() { return cachedEmployees.filter(e => !e.deleted_at); }
function getAllEmployees() { return cachedEmployees; }
function getLogs() { return cachedLogs; }

// ========== Tool Functions ==========
async function addTool(data) {
    const toolNumber = data.tool_number || `T-${Date.now().toString().slice(-8)}`;
    
    const toolData = {
        no: data.no || null,
        registration_id_number: data.registration_id_number || null,
        area_process: data.area_process || null,
        equipment_name: data.name,
        manufacturer: data.manufacturer || null,
        model: data.model || null,
        serial_number: data.serial_number || null,
        type_of_calibration: data.type_of_calibration || null,
        calibration_range: data.calibration_range || null,
        date_of_registration: data.date_of_registration || null,
        resolution: data.resolution || null,
        accuracy: data.accuracy || null,
        remarks: data.remarks || null,
        calibrate_due: data.calibrate_due || null,
        tool_number: toolNumber
    };
    
    await apiCall('add_tool', toolData);
    await fetchTools(); // Refresh cache
}

async function updateToolCalibrateDue(toolId, newDate) {
    await apiCall('update_tool_calibrate_due', { tool_id: toolId, calibrate_due: newDate });
    await fetchTools(); // Refresh cache
}

async function toggleToolDamage(toolId) {
    await apiCall('toggle_tool_damage', { tool_id: toolId });
    await fetchTools(); // Refresh cache
}

async function deleteTool(toolId) {
    await apiCall('delete_tool', { tool_id: toolId });
    await fetchTools(); // Refresh cache
}

// ========== Employee Functions ==========
async function addEmployee(data) {
    const employeeData = {
        name: data.name,
        id_number: data.id_number,
        password: data.password
    };
    
    await apiCall('add_employee', employeeData);
    await fetchEmployees(); // Refresh cache
    return employeeData;
}

async function deleteEmployee(employeeId) {
    await apiCall('delete_employee', { employee_id: employeeId });
    await fetchEmployees(); // Refresh cache
}

// ========== Log Functions ==========
async function createBorrowLog(data) {
    const logData = {
        employee_id: data.employee.id,
        employee_id_number: data.employee.id_number,
        tool_id: data.tool.id,
        tool_name: data.tool.name,
        tool_number: data.tool.tool_number,
        condition: data.condition,
        borrow_remarks: data.borrow_remarks || null
    };
    
    await apiCall('add_borrow_log', logData);
    await fetchLogs(); // Refresh cache
}

async function createReturnLog(data) {
    const logData = {
        employee_id: data.employee.id,
        employee_id_number: data.employee.id_number,
        tool_id: data.tool.id,
        tool_name: data.tool.name,
        tool_number: data.tool.tool_number,
        condition: data.condition,
        return_remarks: data.return_remarks || null
    };
    
    await apiCall('add_return_log', logData);
    await fetchLogs(); // Refresh cache
    await fetchTools(); // Refresh tool cache for status updates
}

function getBorrowedToolsForEmployee(employeeId) {
    const logs = getLogs();
    const tools = getTools();
    const toolCounts = new Map();

    logs.filter((l) => l.employee_id === employeeId).forEach((log) => {
        const key = log.tool_id;
        const current = toolCounts.get(key) || { borrows: 0, returns: 0, lastBorrowLog: null };
        if (log.action === 'borrow') {
            current.borrows++;
            current.lastBorrowLog = log;
        } else {
            current.returns++;
        }
        toolCounts.set(key, current);
    });

    const result = [];
    toolCounts.forEach((counts, toolId) => {
        if (counts.borrows > counts.returns && counts.lastBorrowLog) {
            const tool = tools.find((t) => t.id == toolId);
            if (tool) {
                result.push({ tool, borrowLog: counts.lastBorrowLog });
            }
        }
    });

    return result;
}

function toolIsCalibrationBlocked(tool) {
    if (!tool?.calibrate_due) return false;
    return tool.calibrate_due <= todayYMD();
}

function getCalibrateDueTools(limit = 5) {
    const today = todayYMD();
    return getTools()
        .filter((t) => t.calibrate_due && t.calibrate_due >= today)
        .sort((a, b) => (a.calibrate_due > b.calibrate_due ? 1 : -1))
        .slice(0, limit);
}

// ========== Log Pairing ==========
function getPairedLogs() {
    const logs = getLogs();
    const borrowLogs = logs.filter((l) => l.action === 'borrow');
    const returnLogs = logs.filter((l) => l.action === 'return');

    const pairedLogs = [];

    borrowLogs.forEach((borrow) => {
        const matchingReturns = returnLogs.filter(
            (r) => r.tool_id == borrow.tool_id && r.employee_id == borrow.employee_id && r.timestamp > borrow.timestamp
        );

        const returnLog = matchingReturns.length > 0
            ? matchingReturns.reduce((earliest, current) =>
                current.timestamp < earliest.timestamp ? current : earliest
            )
            : null;

        pairedLogs.push({
            borrow_id: borrow.id,
            return_id: returnLog?.id || null,
            employee_id: borrow.employee_id,
            employee_id_number: borrow.employee_id_number,
            tool_id: borrow.tool_id,
            tool_name: borrow.tool_name,
            tool_number: borrow.tool_number,
            borrow_time: borrow.timestamp,
            borrow_condition: borrow.condition,
            borrow_remarks: borrow.borrow_remarks || "",
            return_time: returnLog?.timestamp || null,
            return_condition: returnLog?.condition || null,
            return_remarks: returnLog?.return_remarks || "",
            verified_by: borrow.verified_by,
        });
    });

    return pairedLogs.sort((a, b) => (b.borrow_time > a.borrow_time ? 1 : -1));
}

function getConditionLabel(condition) {
    const labels = {
        good: "Good",
        for_calibration: "For Calibration",
        calibration_done: "Calibration Done",
        damaged: "Damaged",
    };
    return labels[condition] || condition || "-";
}

function filterPairedLogs(logs, query) {
    if (!query?.trim()) return logs;
    const q = query.toLowerCase().trim();
    return logs.filter((log) =>
        [log.employee_id_number, log.tool_name, log.tool_number, log.borrow_time, log.return_time]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
    );
}

// ========== UI State ==========
let currentView = "dashboard";
let toolListMode = "all";
let selectedToolIds = new Set();
let currentBarcodeData = null;
let scanMode = "borrow";
let currentEmployee = null;
let borrowedTools = [];

// ========== Rendering Functions ==========
function renderScanForm() {
    const container = document.getElementById("scan-form-container");
    const verifiedBy = document.querySelector('#user-name-display')?.textContent || "User";

    container.innerHTML = `
    <div class="mode-toggle">
      <button class="btn ${scanMode === 'borrow' ? 'btn-primary' : 'btn-outline'}" onclick="setScanMode('borrow')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
        Borrow
      </button>
      <button class="btn ${scanMode === 'return' ? 'btn-success' : 'btn-outline'}" onclick="setScanMode('return')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Return
      </button>
    </div>
    ${scanMode === 'borrow' ? renderBorrowForm(verifiedBy) : renderReturnForm(verifiedBy)}
    <div id="scan-message"></div>
  `;
}

function setScanMode(mode) {
    scanMode = mode;
    currentEmployee = null;
    borrowedTools = [];
    renderScanForm();
}

function renderBorrowForm(verifiedBy) {
    return `
    <div class="space-y-3">
      <div class="form-group">
        <label class="label">Tool barcode / Tool number</label>
        <input type="text" class="input" id="scan-tool" placeholder="Scan tool..." onkeydown="if(event.key==='Enter'){document.getElementById('scan-emp').focus();}">
      </div>
      <div class="form-group">
        <label class="label">Employee barcode / ID number</label>
        <input type="text" class="input" id="scan-emp" placeholder="Scan employee...">
      </div>
      <div class="form-group">
        <label class="label">Tool Condition (Required)</label>
        <select class="select" id="borrow-condition">
          <option value="">Select condition...</option>
          <option value="good">Good</option>
          <option value="for_calibration">For Calibration</option>
        </select>
      </div>
      <div class="form-group">
        <label class="label">Borrow Remarks (Optional)</label>
        <input type="text" class="input" id="borrow-remarks" placeholder="Optional remarks for borrow...">
      </div>
      <button class="btn btn-primary w-full" onclick="submitBorrow('${verifiedBy}')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
        Submit Borrow
      </button>
    </div>
  `;
}

function renderReturnForm(verifiedBy) {
    let toolOptions = borrowedTools.map(({ tool }) =>
        `<option value="${tool.id}">${tool.equipment_name} (${tool.tool_number})</option>`
    ).join('');

    return `
    <div class="space-y-3">
      <div class="form-group">
        <label class="label">Employee barcode / ID number</label>
        <input type="text" class="input" id="return-emp" placeholder="Scan employee to see borrowed tools..." 
          onkeydown="if(event.key==='Enter'){handleEmployeeScan();}" 
          onblur="handleEmployeeScan()">
      </div>
      ${currentEmployee ? `<p class="text-sm text-muted">Employee: <strong>${currentEmployee.id_number}</strong></p>` : ''}
      ${borrowedTools.length > 0 ? `
        <div class="form-group">
          <label class="label">Select Tool to Return</label>
          <select class="select" id="return-tool">
            <option value="">Select tool...</option>
            ${toolOptions}
          </select>
        </div>
      ` : ''}
      <div class="form-group">
        <label class="label">Return Condition (Required)</label>
        <select class="select" id="return-condition">
          <option value="">Select condition...</option>
          <option value="good">Good</option>
          <option value="calibration_done">Calibration Done</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>
      <div class="form-group">
        <label class="label">Return Remarks (Optional)</label>
        <input type="text" class="input" id="return-remarks" placeholder="Optional remarks for return...">
      </div>
      <button class="btn btn-success w-full" onclick="submitReturn('${verifiedBy}')" ${borrowedTools.length === 0 ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Submit Return
      </button>
    </div>
  `;
}

function handleEmployeeScan() {
    const input = document.getElementById('return-emp');
    if (!input) return;
    const idNumber = input.value.trim().toLowerCase();
    if (!idNumber) return;

    const employee = getEmployees().find(e => e.id_number === idNumber);
    if (!employee) {
        showScanMessage("error", "Employee not found.");
        return;
    }

    currentEmployee = employee;
    borrowedTools = getBorrowedToolsForEmployee(employee.id);

    if (borrowedTools.length === 0) {
        showScanMessage("error", "This employee has no borrowed tools.");
    }

    renderScanForm();
}

async function submitBorrow(verifiedBy) {
    const toolBarcode = document.getElementById('scan-tool').value.trim().toLowerCase();
    const employeeBarcode = document.getElementById('scan-emp').value.trim().toLowerCase();
    const condition = document.getElementById('borrow-condition').value;
    const remarks = document.getElementById('borrow-remarks').value;

    if (!toolBarcode || !employeeBarcode) {
        showScanMessage("error", "Scan both Tool and Employee barcodes.");
        return;
    }

    if (!condition) {
        showScanMessage("error", "Select tool condition before borrowing.");
        return;
    }

    const tool = getTools().find(t => t.tool_number === toolBarcode);
    if (!tool) {
        showScanMessage("error", "Tool not found.");
        return;
    }

    const employee = getEmployees().find(e => e.id_number === employeeBarcode);
    if (!employee) {
        showScanMessage("error", "Employee not found.");
        return;
    }

    if (toolIsCalibrationBlocked(tool)) {
        showScanMessage("error", `Blocked: ${tool.equipment_name} is due for calibration (${tool.calibrate_due}).`);
        return;
    }

    await createBorrowLog({
        employee,
        tool,
        condition,
        verified_by: verifiedBy,
        borrow_remarks: remarks,
    });

    showScanMessage("success", `Logged: ${employee.id_number} borrowed ${tool.equipment_name}`);
    document.getElementById('scan-tool').value = '';
    document.getElementById('scan-emp').value = '';
    document.getElementById('borrow-condition').value = '';
    document.getElementById('borrow-remarks').value = '';
    renderDashboard();
}

async function submitReturn(verifiedBy) {
    if (!currentEmployee) {
        showScanMessage("error", "Scan employee barcode first.");
        return;
    }

    const toolId = document.getElementById('return-tool').value;
    const condition = document.getElementById('return-condition').value;
    const remarks = document.getElementById('return-remarks').value;
    if (!toolId) {
        showScanMessage("error", "Select a tool to return.");
        return;
    }

    if (!condition) {
        showScanMessage("error", "Select tool condition upon return.");
        return;
    }

    const tool = getTools().find(t => t.id == toolId);
    if (!tool) {
        showScanMessage("error", "Tool not found.");
        return;
    }

    await createReturnLog({
        employee: currentEmployee,
        tool,
        condition,
        verified_by: verifiedBy,
        return_remarks: remarks,
    });

    showScanMessage("success", `Logged: ${currentEmployee.id_number} returned ${tool.equipment_name}`);
    currentEmployee = null;
    borrowedTools = [];
    renderScanForm();
    renderDashboard();
}

function showScanMessage(type, text) {
    const container = document.getElementById('scan-message');
    if (!container) return;
    container.innerHTML = `
    <div class="message message-${type}" style="margin-top: 0.75rem;">
      ${type === 'success' ? '✓' : '⚠'} ${text}
    </div>
  `;
    setTimeout(() => { container.innerHTML = ''; }, 3500);
}

function renderLogsTable(logs, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (logs.length === 0) {
        container.innerHTML = `
      <div class="text-center text-muted" style="padding: 2rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 0.5rem; opacity: 0.5;"><path d="M16 3l5 5-5 5"/><path d="M21 8H9"/><path d="M8 21l-5-5 5-5"/><path d="M3 16h12"/></svg>
        <p>No logs found</p>
      </div>
    `;
        return;
    }

    const conditionColors = {
        good: "badge-success",
        for_calibration: "badge-warning",
        calibration_done: "badge-primary",
        damaged: "badge-danger",
    };

    let html = `
    <table>
      <thead>
        <tr>
          <th>Employee ID</th>
          <th>Tool Name</th>
          <th>Borrow Time</th>
          <th>Borrow Status</th>
          <th>Borrow Remarks</th>
          <th>Return Time</th>
          <th>Return Status</th>
          <th>Return Remarks</th>
          <th>Verified By</th>
        </tr>
      </thead>
      <tbody>
  `;

    logs.forEach(log => {
        html += `
      <tr>
        <td class="font-mono text-xs">${log.employee_id_number}</td>
        <td>
          <div class="font-bold">${log.tool_name}</div>
          <div class="text-xs text-muted">${log.tool_number}</div>
        </td>
        <td class="text-xs">${log.borrow_time}</td>
        <td><span class="badge ${conditionColors[log.borrow_condition] || ''}">${getConditionLabel(log.borrow_condition)}</span></td>
        <td class="text-xs truncate">${log.borrow_remarks || '-'}</td>
        <td class="text-xs">${log.return_time || '<span class="text-warning font-bold">Pending</span>'}</td>
        <td>${log.return_condition ? `<span class="badge ${conditionColors[log.return_condition] || ''}">${getConditionLabel(log.return_condition)}</span>` : '<span class="text-xs text-muted">-</span>'}</td>
        <td class="text-xs truncate">${log.return_remarks || '-'}</td>
        <td class="text-xs">${log.verified_by || '-'}</td>
      </tr>
    `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderCalibrateDueList() {
    const container = document.getElementById('calibrate-due-list');
    if (!container) return;
    const tools = getCalibrateDueTools(5);

    if (tools.length === 0) {
        container.innerHTML = '<p class="text-center text-muted" style="padding: 1rem;">No calibration due</p>';
        return;
    }

    let html = tools.map(tool => `
    <div class="flex items-center justify-between" style="padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
      <div>
        <div class="font-bold text-sm">${tool.equipment_name}</div>
        <div class="text-xs text-muted">${tool.tool_number}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-warning text-xs font-bold">${tool.calibrate_due || 'NA'}</span>
        <button class="btn btn-outline btn-sm" onclick="editCalibrateDue('${tool.id}', '${tool.calibrate_due || ''}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

    container.innerHTML = html;
}

async function editCalibrateDue(toolId, currentDate) {
    const newDate = prompt('Enter new calibration due date (YYYY-MM-DD):', currentDate);
    if (newDate !== null) {
        await updateToolCalibrateDue(toolId, newDate || null);
        renderDashboard();
    }
}

async function renderDashboard() {
    const search = document.getElementById('global-search')?.value || '';
    
    // Fetch latest data
    await Promise.all([fetchTools(), fetchLogs()]);
    
    const tools = getTools();
    const today = todayYMD();

    // Stats
    const statTotal = document.getElementById('stat-total');
    const statDamage = document.getElementById('stat-damage');
    const statCalibrate = document.getElementById('stat-calibrate');
    
    if (statTotal) statTotal.textContent = tools.length;
    if (statDamage) statDamage.textContent = tools.filter(t => t.status === 'damage').length;
    if (statCalibrate) statCalibrate.textContent = tools.filter(t => t.calibrate_due && t.calibrate_due >= today).length;

    // Logs
    const pairedLogs = getPairedLogs();
    const filteredLogs = filterPairedLogs(pairedLogs, search).slice(0, 50);
    renderLogsTable(filteredLogs, 'recent-logs-table');

    // Calibrate due
    renderCalibrateDueList();

    // Scan form
    renderScanForm();
}

async function renderBorrowers() {
    const search = document.getElementById('borrower-search')?.value || '';
    await fetchLogs();
    const pairedLogs = getPairedLogs();
    const filteredLogs = filterPairedLogs(pairedLogs, search);
    renderLogsTable(filteredLogs, 'borrowers-table');
}

async function renderEmployees() {
    const search = (document.getElementById('employee-search')?.value || '').toLowerCase().trim();
    await fetchEmployees();
    let employees = getEmployees();

    if (search) {
        employees = employees.filter(e =>
            [e.name, e.id_number].join(' ').toLowerCase().includes(search)
        );
    }

    const container = document.getElementById('employees-table');
    if (!container) return;
    if (employees.length === 0) {
        container.innerHTML = `
      <div class="text-center text-muted" style="padding: 2rem;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 0.5rem; opacity: 0.5;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <p>No employees found</p>
      </div>
    `;
        return;
    }

    let html = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>ID Number</th>
          <th>Barcode</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

    employees.forEach(emp => {
        html += `
      <tr>
        <td class="font-bold">${emp.name}</td>
        <td class="text-muted">${emp.id_number}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="showEmployeeBarcode('${emp.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>
            Show
          </button>
        </td>
        <td>
          <button class="btn btn-outline btn-sm text-destructive" onclick="confirmDeleteEmployee('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      </tr>
    `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function renderReports() {
    const search = document.getElementById('report-search')?.value || '';
    await fetchLogs();
    const pairedLogs = getPairedLogs();
    const filteredLogs = filterPairedLogs(pairedLogs, search);
    renderLogsTable(filteredLogs, 'reports-table');
}

// ========== Tool List Modal ==========
function openToolList(mode) {
    toolListMode = mode;
    selectedToolIds = new Set();
    const searchInput = document.getElementById('tool-list-search');
    if (searchInput) searchInput.value = '';

    const titles = {
        all: 'All Tools',
        damage: 'Damaged Tools',
        calibrate: 'Calibration Due (Today Onwards)',
    };
    const titleEl = document.getElementById('tool-list-title');
    if (titleEl) titleEl.textContent = titles[mode];

    renderToolListModal();
    openModal('tool-list-modal');
}

async function renderToolListModal() {
    await fetchTools();
    
    const search = (document.getElementById('tool-list-search')?.value || '').toLowerCase().trim();
    const today = todayYMD();
    let tools = getTools();

    if (toolListMode === 'damage') {
        tools = tools.filter(t => t.status === 'damage');
    } else if (toolListMode === 'calibrate') {
        tools = tools.filter(t => t.calibrate_due && t.calibrate_due >= today);
    }

    if (search) {
        tools = tools.filter(t =>
            [t.equipment_name, t.model, t.tool_number, t.calibrate_due].filter(Boolean).join(' ').toLowerCase().includes(search)
        );
    }

    // Actions
    const actionsEl = document.getElementById('tool-list-actions');
    if (actionsEl) {
        if (selectedToolIds.size > 0) {
            actionsEl.style.display = 'flex';
            actionsEl.classList.add('items-center', 'gap-3');
            const countEl = document.getElementById('selected-count');
            if (countEl) countEl.textContent = `${selectedToolIds.size} selected`;
        } else {
            actionsEl.style.display = 'none';
        }
    }

    const container = document.getElementById('tool-list-table');
    if (!container) return;
    if (tools.length === 0) {
        container.innerHTML = '<p class="text-center text-muted" style="padding: 2rem;">No tools found</p>';
        return;
    }

    let html = `
    <table>
      <thead>
        <tr>
          <th style="width: 2rem;"><input type="checkbox" class="checkbox" onchange="toggleSelectAllTools(this.checked)" ${selectedToolIds.size === tools.length && tools.length > 0 ? 'checked' : ''}></th>
          <th>Tool #</th>
          <th>Name</th>
          <th>Model</th>
          <th>Calibrate Due</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

    tools.forEach(tool => {
        html += `
      <tr>
        <td><input type="checkbox" class="checkbox" data-tool-id="${tool.id}" ${selectedToolIds.has(String(tool.id)) ? 'checked' : ''} onchange="toggleSelectTool('${tool.id}')"></td>
        <td class="font-mono text-xs">${tool.tool_number}</td>
        <td class="font-bold">${tool.equipment_name}</td>
        <td class="text-muted">${tool.model || '-'}</td>
        <td>
          <span class="${tool.calibrate_due ? 'text-warning' : 'text-muted'} text-xs">${tool.calibrate_due || 'NA'}</span>
          <button class="btn btn-outline btn-sm" style="padding: 0.25rem; margin-left: 0.25rem;" onclick="editCalibrateDue('${tool.id}', '${tool.calibrate_due || ''}'); renderToolListModal();">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </td>
        <td>
          <span class="badge ${tool.status === 'damage' ? 'badge-danger' : 'badge-success'}">${tool.status === 'damage' ? 'Damage' : 'Good'}</span>
        </td>
        <td>
          <div class="flex gap-1">
            <button class="btn btn-outline btn-sm" onclick="toggleToolDamage('${tool.id}'); renderToolListModal(); renderDashboard();">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Toggle
            </button>
            <button class="btn btn-outline btn-sm" onclick="showToolBarcode('${tool.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function toggleSelectTool(toolId) {
    if (selectedToolIds.has(String(toolId))) {
        selectedToolIds.delete(String(toolId));
    } else {
        selectedToolIds.add(String(toolId));
    }
    renderToolListModal();
}

function toggleSelectAllTools(checked) {
    const tools = getFilteredToolsForModal();
    if (checked) {
        tools.forEach(t => selectedToolIds.add(String(t.id)));
    } else {
        selectedToolIds.clear();
    }
    renderToolListModal();
}

function getFilteredToolsForModal() {
    const search = (document.getElementById('tool-list-search')?.value || '').toLowerCase().trim();
    const today = todayYMD();
    let tools = getTools();
    if (toolListMode === 'damage') {
        tools = tools.filter(t => t.status === 'damage');
    } else if (toolListMode === 'calibrate') {
        tools = tools.filter(t => t.calibrate_due && t.calibrate_due >= today);
    }

    if (search) {
        tools = tools.filter(t =>
            [t.equipment_name, t.model, t.tool_number, t.calibrate_due].filter(Boolean).join(' ').toLowerCase().includes(search)
        );
    }

    return tools;
}

function printSelectedBarcodes() {
    const tools = getTools().filter(t => selectedToolIds.has(String(t.id)));
    if (tools.length === 0) return;

    currentBarcodeData = { type: 'batch', tools };
    renderBarcodeModal();
    openModal('barcode-modal');
}

// ========== Barcode Functions ==========
function showEmployeeBarcode(empId) {
    const emp = getEmployees().find(e => e.id == empId);
    if (!emp) return;

    currentBarcodeData = { type: 'employee', data: emp };
    renderBarcodeModal();
    openModal('barcode-modal');
}

function showToolBarcode(toolId) {
    const tool = getTools().find(t => t.id == toolId);
    if (!tool) return;

    currentBarcodeData = { type: 'tool', data: tool };
    renderBarcodeModal();
    openModal('barcode-modal');
}

function renderBarcodeModal() {
    const container = document.getElementById('barcode-container');
    if (!container) return;
    if (!currentBarcodeData) {
        container.innerHTML = '<p class="text-muted">No barcode data</p>';
        return;
    }

    if (currentBarcodeData.type === 'employee') {
        const emp = currentBarcodeData.data;
        container.innerHTML = `
      <div class="barcode-label">${emp.name}</div>
      <svg id="barcode-svg"></svg>
      <div class="barcode-sublabel">Employee ID: ${emp.id_number}</div>
    `;
        setTimeout(() => {
            JsBarcode('#barcode-svg', emp.id_number.toLowerCase(), {
                format: 'CODE128',
                width: 2,
                height: 60,
                displayValue: true,
                fontSize: 14,
                margin: 10,
            });
        }, 10);
    } else if (currentBarcodeData.type === 'tool') {
        const tool = currentBarcodeData.data;
        container.innerHTML = `
      <div class="barcode-label">${tool.equipment_name}</div>
      <svg id="barcode-svg"></svg>
      <div class="barcode-sublabel">${tool.model || 'No model'}</div>
    `;
        setTimeout(() => {
            JsBarcode('#barcode-svg', tool.tool_number.toLowerCase(), {
                format: 'CODE128',
                width: 2,
                height: 60,
                displayValue: true,
                fontSize: 14,
                margin: 10,
            });
        }, 10);
    } else if (currentBarcodeData.type === 'batch') {
        let html = '<div style="display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center;">';
        currentBarcodeData.tools.forEach((tool, idx) => {
            html += `
        <div style="text-align: center; padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius);">
          <div class="barcode-label" style="font-size: 0.75rem;">${tool.equipment_name}</div>
          <svg id="barcode-svg-${idx}"></svg>
          <div class="barcode-sublabel">${tool.model || ''}</div>
        </div>
      `;
        });
        html += '</div>';
        container.innerHTML = html;
        setTimeout(() => {
            currentBarcodeData.tools.forEach((tool, idx) => {
                JsBarcode(`#barcode-svg-${idx}`, tool.tool_number.toLowerCase(), {
                    format: 'CODE128',
                    width: 1.5,
                    height: 40,
                    displayValue: true,
                    fontSize: 10,
                    margin: 5,
                });
            });
        }, 10);
    }
}

function printBarcode() {
    const container = document.getElementById('barcode-container');
    if (!container) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Print Barcode</title>
      <style>
        body { font-family: 'Inter', sans-serif; text-align: center; padding: 20px; }
        .barcode-label { font-weight: 700; margin-bottom: 5px; }
        .barcode-sublabel { font-size: 12px; color: #666; }
        @media print {
          @page { margin: 10mm; }
        }
      </style>
    </head>
    <body>
      ${container.innerHTML}
      <script>
        window.onload = function() {
          window.print();
          window.close();
        };
      </scr` + `ipt>
    </body>
    </html>
  `);
    printWindow.document.close();
}

// ========== Employee Delete ==========
let pendingDeleteEmployeeId = null;

function confirmDeleteEmployee(empId, empName) {
    pendingDeleteEmployeeId = empId;
    const textEl = document.getElementById('confirm-delete-text');
    if (textEl) {
        textEl.innerHTML = `Are you sure you want to delete <strong>${empName}</strong>? Their borrow history will be preserved in the logs.`;
    }
    openModal('confirm-delete-modal');
}

// ========== CSV Functions ==========
function downloadLogsCSV() {
    const search = document.getElementById('global-search')?.value || '';
    const pairedLogs = getPairedLogs();
    const filteredLogs = filterPairedLogs(pairedLogs, search);
    downloadCSV(filteredLogs.map(l => ({
        employee_id: l.employee_id_number,
        tool: l.tool_name,
        tool_number: l.tool_number,
        borrow_time: l.borrow_time,
        borrow_status: getConditionLabel(l.borrow_condition),
        borrow_remarks: l.borrow_remarks || '',
        return_time: l.return_time || '',
        return_status: l.return_condition ? getConditionLabel(l.return_condition) : '',
        return_remarks: l.return_remarks || '',
        verified_by: l.verified_by,
    })), 'logs.csv');
}

function downloadReportCSV() {
    const search = document.getElementById('report-search')?.value || '';
    const pairedLogs = getPairedLogs();
    const filteredLogs = filterPairedLogs(pairedLogs, search);
    downloadCSV(filteredLogs.map(l => ({
        employee_id: l.employee_id_number,
        tool: l.tool_name,
        tool_number: l.tool_number,
        borrow_time: l.borrow_time,
        borrow_status: getConditionLabel(l.borrow_condition),
        borrow_remarks: l.borrow_remarks || '',
        return_time: l.return_time || '',
        return_status: l.return_condition ? getConditionLabel(l.return_condition) : '',
        return_remarks: l.return_remarks || '',
        verified_by: l.verified_by,
    })), 'report.csv');
}

function downloadCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [
        headers.join(','),
        ...data.map(row =>
            headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
        ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function importCSV() {
    const fileInput = document.getElementById('csv-file');
    const file = fileInput?.files[0];
    if (!file) {
        alert('Please select a CSV file.');
        return;
    }

    const formData = new FormData();
    formData.append('csv_file', file);

    try {
        const result = await fetch('api.php?action=import_csv', {
            method: 'POST',
            body: formData
        });

        const response = await result.json();
        
        if (response.success) {
            alert(`Import successful! ${response.data.imported} tools imported.`);
            if (response.data.errors && response.data.errors.length > 0) {
                console.warn('Import warnings:', response.data.errors);
            }
            closeModal('csv-upload-modal');
            fileInput.value = '';
            renderDashboard();
        } else {
            alert('Import failed: ' + response.message);
        }
    } catch (error) {
        console.error('Import error:', error);
        alert('Import failed: ' + error.message);
    }
}

// ========== Modal Functions ==========
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// ========== Navigation ==========
function switchView(view) {
    currentView = view;

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.toggle('active', v.id === `view-${view}`);
    });

    // Render appropriate view
    if (view === 'dashboard') renderDashboard();
    else if (view === 'borrowers') renderBorrowers();
    else if (view === 'employees') renderEmployees();
    else if (view === 'reports') renderReports();
}

// ========== App Functions ==========
function showApp() {
    const authPage = document.getElementById('auth-page');
    const appPage = document.getElementById('app-page');
    
    if (authPage) authPage.style.display = 'none';
    if (appPage) appPage.style.display = 'flex';

    const nameDisplay = document.getElementById('user-name-display');
    const initialDisplay = document.getElementById('user-initial');
    if (nameDisplay) nameDisplay.textContent = document.querySelector('#user-name-display')?.textContent || 'User';
    if (initialDisplay) initialDisplay.textContent = (document.querySelector('#user-name-display')?.textContent || 'U').charAt(0).toUpperCase();

    renderDashboard();
}

async function init() {
    // Setup event listeners
    setupEventListeners();
}

function setupEventListeners() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            const loginForm = document.getElementById('login-form');
            const signupForm = document.getElementById('signup-form');
            if (loginForm) loginForm.style.display = isLogin ? 'block' : 'none';
            if (signupForm) signupForm.style.display = isLogin ? 'none' : 'block';
        });
    });

    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('login-name')?.value.trim();
            const id = document.getElementById('login-id')?.value.trim();
            const pass = document.getElementById('login-pass')?.value;

            try {
                const result = await apiCall('login', {
                    name,
                    id_number: id,
                    password: pass
                });
                
                showApp();
            } catch (error) {
                alert('Invalid credentials.');
            }
        });
    }

    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name')?.value.trim();
            const id = document.getElementById('signup-id')?.value.trim();
            const pass = document.getElementById('signup-pass')?.value;

            try {
                const result = await apiCall('signup', {
                    name,
                    id_number: id,
                    password: pass
                });
                
                alert('Account created successfully!');
                showApp();
            } catch (error) {
                alert(error.message || 'Failed to create account.');
            }
        });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await apiCall('logout');
                location.reload();
            } catch (error) {
                location.reload();
            }
        });
    }

    // Add Tool form
    const addToolForm = document.getElementById('add-tool-form');
    if (addToolForm) {
        addToolForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                name: document.getElementById('tool-equipment-name')?.value,
                registration_id_number: document.getElementById('tool-registration-id')?.value,
                area_process: document.getElementById('tool-area')?.value,
                manufacturer: document.getElementById('tool-manufacturer')?.value,
                model: document.getElementById('tool-model')?.value,
                serial_number: document.getElementById('tool-serial')?.value,
                type_of_calibration: document.getElementById('tool-calibration-type')?.value,
                calibration_range: document.getElementById('tool-calibration-range')?.value,
                date_of_registration: document.getElementById('tool-registration-date')?.value,
                resolution: document.getElementById('tool-resolution')?.value,
                accuracy: document.getElementById('tool-accuracy')?.value,
                remarks: document.getElementById('tool-remarks')?.value,
                calibrate_due: document.getElementById('tool-calibrate')?.value || null,
                tool_number: document.getElementById('tool-number')?.value || null
            };

            try {
                await addTool(data);
                addToolForm.reset();
                closeModal('add-tool-modal');
                renderDashboard();
            } catch (error) {
                alert('Failed to add tool: ' + error.message);
            }
        });
    }

    // Add Employee form
    const addEmployeeForm = document.getElementById('add-employee-form');
    if (addEmployeeForm) {
        addEmployeeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('emp-name')?.value;
            const id = document.getElementById('emp-id')?.value;
            const pass = document.getElementById('emp-pass')?.value;
            try {
                await addEmployee({ name, id_number: id, password: pass });
                addEmployeeForm.reset();
                closeModal('add-employee-modal');
                renderEmployees();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    // Confirm delete
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (pendingDeleteEmployeeId) {
                try {
                    await deleteEmployee(pendingDeleteEmployeeId);
                    pendingDeleteEmployeeId = null;
                    closeModal('confirm-delete-modal');
                    renderEmployees();
                } catch (error) {
                    alert('Failed to delete employee: ' + error.message);
                }
            }
        });
    }

    // Global search
    const globalSearch = document.getElementById('global-search');
    if (globalSearch) {
        globalSearch.addEventListener('input', () => {
            renderDashboard();
        });
    }

    // Nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Close modals when clicking overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);