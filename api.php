<?php
session_start();
require_once 'config.php';

header('Content-Type: application/json');

// Helper function to get JSON input
function getJSONInput() {
    $input = file_get_contents('php://input');
    return json_decode($input, true);
}

// Check if user is authenticated for protected endpoints
function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, null, 'Unauthorized');
    }
}

// Get action from request
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        // ========== AUTHENTICATION ==========
        case 'login':
            $input = getJSONInput();
            $name = $input['name'] ?? '';
            $idNumber = $input['id_number'] ?? '';
            $password = $input['password'] ?? '';
            
            $conn = getDBConnection();
            $stmt = $conn->prepare("SELECT * FROM users WHERE id_number = ? AND password = ?");
            $stmt->execute([$idNumber, $password]);
            $user = $stmt->fetch();
            
            if ($user) {
                $_SESSION['user_id'] = $user['id'];
                $_SESSION['user_name'] = $user['name'];
                $_SESSION['user_id_number'] = $user['id_number'];
                jsonResponse(true, [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'id_number' => $user['id_number']
                ], 'Login successful');
            } else {
                jsonResponse(false, null, 'Invalid credentials');
            }
            break;

        case 'signup':
            $input = getJSONInput();
            $name = $input['name'] ?? '';
            $idNumber = $input['id_number'] ?? '';
            $password = $input['password'] ?? '';
            
            $conn = getDBConnection();
            
            // Check if user exists
            $stmt = $conn->prepare("SELECT id FROM users WHERE id_number = ?");
            $stmt->execute([$idNumber]);
            if ($stmt->fetch()) {
                jsonResponse(false, null, 'ID number already registered');
            }
            
            // Create user
            $stmt = $conn->prepare("INSERT INTO users (name, id_number, password) VALUES (?, ?, ?)");
            $stmt->execute([$name, $idNumber, $password]);
            $userId = $conn->lastInsertId();
            
            // Also create employee
            $stmt = $conn->prepare("INSERT INTO employees (name, id_number, password) VALUES (?, ?, ?)");
            $stmt->execute([$name, $idNumber, $password]);
            
            $_SESSION['user_id'] = $userId;
            $_SESSION['user_name'] = $name;
            $_SESSION['user_id_number'] = $idNumber;
            
            jsonResponse(true, ['id' => $userId, 'name' => $name, 'id_number' => $idNumber], 'Account created successfully');
            break;

        case 'logout':
            session_destroy();
            jsonResponse(true, null, 'Logged out successfully');
            break;

        case 'check_session':
            if (isset($_SESSION['user_id'])) {
                jsonResponse(true, [
                    'id' => $_SESSION['user_id'],
                    'name' => $_SESSION['user_name'],
                    'id_number' => $_SESSION['user_id_number']
                ]);
            } else {
                jsonResponse(false, null, 'Not logged in');
            }
            break;

        // ========== TOOLS ==========
        case 'get_tools':
            requireAuth();
            $conn = getDBConnection();
            $stmt = $conn->query("SELECT * FROM tools WHERE deleted_at IS NULL");
            $tools = $stmt->fetchAll();
            jsonResponse(true, $tools);
            break;

        case 'add_tool':
            requireAuth();
            $input = getJSONInput();
            
            $conn = getDBConnection();
            
            // Generate tool number if not provided
            $toolNumber = $input['tool_number'] ?? 'T-' . time();
            
            $stmt = $conn->prepare("INSERT INTO tools (no, registration_id_number, area_process, equipment_name, manufacturer, model, serial_number, type_of_calibration, calibration_range, date_of_registration, resolution, accuracy, remarks, calibrate_due, tool_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'good')");
            
            $stmt->execute([
                $input['no'] ?? null,
                $input['registration_id_number'] ?? null,
                $input['area_process'] ?? null,
                $input['equipment_name'],
                $input['manufacturer'] ?? null,
                $input['model'] ?? null,
                $input['serial_number'] ?? null,
                $input['type_of_calibration'] ?? null,
                $input['calibration_range'] ?? null,
                $input['date_of_registration'] ?? null,
                $input['resolution'] ?? null,
                $input['accuracy'] ?? null,
                $input['remarks'] ?? null,
                $input['calibrate_due'] ?? null,
                $toolNumber
            ]);
            
            jsonResponse(true, ['id' => $conn->lastInsertId()], 'Tool added successfully');
            break;

        case 'update_tool_calibrate_due':
            requireAuth();
            $input = getJSONInput();
            $toolId = $input['tool_id'];
            $newDate = $input['calibrate_due'] ?? null;
            
            $conn = getDBConnection();
            $stmt = $conn->prepare("UPDATE tools SET calibrate_due = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$newDate, $toolId]);
            
            jsonResponse(true, null, 'Calibration due date updated');
            break;

        case 'toggle_tool_damage':
            requireAuth();
            $input = getJSONInput();
            $toolId = $input['tool_id'];
            
            $conn = getDBConnection();
            $stmt = $conn->prepare("UPDATE tools SET status = CASE WHEN status = 'damage' THEN 'good' ELSE 'damage' END, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$toolId]);
            
            jsonResponse(true, null, 'Tool status updated');
            break;

        case 'delete_tool':
            requireAuth();
            $input = getJSONInput();
            $toolId = $input['tool_id'];
            
            $conn = getDBConnection();
            $stmt = $conn->prepare("UPDATE tools SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?");
            $stmt->execute([$toolId]);
            
            jsonResponse(true, null, 'Tool deleted');
            break;

        // ========== EMPLOYEES ==========
        case 'get_employees':
            requireAuth();
            $conn = getDBConnection();
            $stmt = $conn->query("SELECT * FROM employees WHERE deleted_at IS NULL");
            $employees = $stmt->fetchAll();
            jsonResponse(true, $employees);
            break;

        case 'add_employee':
            requireAuth();
            $input = getJSONInput();
            
            $conn = getDBConnection();
            
            // Check if employee exists
            $stmt = $conn->prepare("SELECT id FROM employees WHERE id_number = ? AND deleted_at IS NULL");
            $stmt->execute([$input['id_number']]);
            if ($stmt->fetch()) {
                jsonResponse(false, null, 'Employee ID already exists');
            }
            
            $stmt = $conn->prepare("INSERT INTO employees (name, id_number, password) VALUES (?, ?, ?)");
            $stmt->execute([$input['name'], $input['id_number'], $input['password']]);
            
            jsonResponse(true, ['id' => $conn->lastInsertId()], 'Employee added successfully');
            break;

        case 'delete_employee':
            requireAuth();
            $input = getJSONInput();
            $employeeId = $input['employee_id'];
            
            $conn = getDBConnection();
            $stmt = $conn->prepare("UPDATE employees SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?");
            $stmt->execute([$employeeId]);
            
            jsonResponse(true, null, 'Employee deleted');
            break;

        // ========== LOGS ==========
        case 'get_logs':
            requireAuth();
            $conn = getDBConnection();
            $stmt = $conn->query("SELECT * FROM logs ORDER BY timestamp DESC");
            $logs = $stmt->fetchAll();
            jsonResponse(true, $logs);
            break;

        case 'add_borrow_log':
            requireAuth();
            $input = getJSONInput();
            $verifiedBy = $_SESSION['user_name'] ?? 'User';
            
            $conn = getDBConnection();
            
            $stmt = $conn->prepare("INSERT INTO logs (action, employee_id, employee_id_number, tool_id, tool_name, tool_number, timestamp, condition, verified_by, borrow_remarks, return_remarks) VALUES ('borrow', ?, ?, ?, ?, ?, NOW(), ?, ?, ?, NULL)");
            
            $stmt->execute([
                $input['employee_id'],
                $input['employee_id_number'],
                $input['tool_id'],
                $input['tool_name'],
                $input['tool_number'],
                $input['condition'],
                $verifiedBy,
                $input['borrow_remarks'] ?? null
            ]);
            
            jsonResponse(true, ['id' => $conn->lastInsertId()], 'Borrow logged successfully');
            break;

        case 'add_return_log':
            requireAuth();
            $input = getJSONInput();
            $verifiedBy = $_SESSION['user_name'] ?? 'User';
            
            $conn = getDBConnection();
            
            // Add return log
            $stmt = $conn->prepare("INSERT INTO logs (action, employee_id, employee_id_number, tool_id, tool_name, tool_number, timestamp, condition, verified_by, borrow_remarks, return_remarks) VALUES ('return', ?, ?, ?, ?, ?, NOW(), ?, ?, NULL, ?)");
            
            $stmt->execute([
                $input['employee_id'],
                $input['employee_id_number'],
                $input['tool_id'],
                $input['tool_name'],
                $input['tool_number'],
                $input['condition'],
                $verifiedBy,
                $input['return_remarks'] ?? null
            ]);
            
            // Update tool status based on return condition
            $newStatus = ($input['condition'] === 'damaged') ? 'damage' : 'good';
            $stmt = $conn->prepare("UPDATE tools SET status = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$newStatus, $input['tool_id']]);
            
            jsonResponse(true, ['id' => $conn->lastInsertId()], 'Return logged successfully');
            break;

        // ========== CSV IMPORT ==========
        case 'import_csv':
            requireAuth();
            
            if (!isset($_FILES['csv_file'])) {
                jsonResponse(false, null, 'No file uploaded');
            }
            
            $file = $_FILES['csv_file'];
            $tempName = $file['tmp_name'];
            
            // Parse CSV
            $handle = fopen($tempName, 'r');
            if (!$handle) {
                jsonResponse(false, null, 'Failed to open CSV file');
            }
            
            // Read headers
            $headers = fgetcsv($handle);
            if (!$headers) {
                fclose($handle);
                jsonResponse(false, null, 'CSV file is empty');
            }
            
            // Expected headers (case-insensitive)
            $expectedHeaders = [
                'No.', 'Registration ID Number', 'Area/Process', 'Equipment Name', 
                'Manufacturer', 'Model', 'Serial Number', 'Type of Calibration', 
                'Calibration Range', 'Date of Registration', 'Resolution', 'Accuracy', 
                'Remarks', 'Calibrate Due'
            ];
            
            // Normalize headers for comparison
            $normalizedHeaders = array_map('trim', array_map('strtolower', $headers));
            $normalizedExpected = array_map('trim', array_map('strtolower', $expectedHeaders));
            
            // Check if headers match (allowing slight variations)
            $missingHeaders = [];
            foreach ($expectedHeaders as $expected) {
                if (!in_array(strtolower(trim($expected)), $normalizedHeaders)) {
                    $missingHeaders[] = $expected;
                }
            }
            
            if (!empty($missingHeaders)) {
                fclose($handle);
                jsonResponse(false, null, 'CSV missing or has incorrect headers. Expected: ' . implode(', ', $expectedHeaders));
            }
            
            $conn = getDBConnection();
            $importedCount = 0;
            $errors = [];
            
            // Read data rows
            $rowNum = 0;
            while (($row = fgetcsv($handle)) !== false) {
                $rowNum++;
                
                // Skip empty rows
                if (empty(array_filter($row))) {
                    continue;
                }
                
                // Map columns
                $data = array_combine($headers, $row);
                
                // Check if equipment name is provided
                if (empty($data['Equipment Name'])) {
                    $errors[] = "Row $rowNum: Equipment Name is required";
                    continue;
                }
                
                // Generate tool number
                $toolNumber = 'T-' . time() . '-' . $rowNum;
                
                // Handle Calibrate Due - if empty, set to NULL (will display as NA)
                $calibrateDue = !empty($data['Calibrate Due']) ? trim($data['Calibrate Due']) : null;
                
                try {
                    $stmt = $conn->prepare("INSERT INTO tools (no, registration_id_number, area_process, equipment_name, manufacturer, model, serial_number, type_of_calibration, calibration_range, date_of_registration, resolution, accuracy, remarks, calibrate_due, tool_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'good')");
                    
                    $stmt->execute([
                        $data['No.'] ?? null,
                        $data['Registration ID Number'] ?? null,
                        $data['Area/Process'] ?? null,
                        $data['Equipment Name'],
                        $data['Manufacturer'] ?? null,
                        $data['Model'] ?? null,
                        $data['Serial Number'] ?? null,
                        $data['Type of Calibration'] ?? null,
                        $data['Calibration Range'] ?? null,
                        !empty($data['Date of Registration']) ? $data['Date of Registration'] : null,
                        $data['Resolution'] ?? null,
                        $data['Accuracy'] ?? null,
                        $data['Remarks'] ?? null,
                        $calibrateDue,
                        $toolNumber
                    ]);
                    
                    $importedCount++;
                } catch (Exception $e) {
                    $errors[] = "Row $rowNum: " . $e->getMessage();
                }
            }
            
            fclose($handle);
            
            if ($importedCount > 0) {
                jsonResponse(true, [
                    'imported' => $importedCount,
                    'errors' => $errors
                ], "Successfully imported $importedCount tools");
            } else {
                jsonResponse(false, ['errors' => $errors], 'No tools were imported');
            }
            break;

        default:
            jsonResponse(false, null, 'Invalid action');
    }
} catch (Exception $e) {
    http_response_code(500);
    jsonResponse(false, null, 'Server error: ' . $e->getMessage());
}
?>