// app.js
console.log("Frontend JavaScript file loaded successfully!");

let currentData = []; // Used to store data fetched from the backend for export
let currentPage = 1;  // Current page number, starts from 1
const itemsPerPage = 20; // Number of items to display per page
let currentStartDate = ''; // Changed from currentSearchDate to currentStartDate
let currentEndDate = '';   // New: Used to store the current end date
let currentStartTime = ''; // Used to store the current start time
let currentEndTime = '';   // Used to store the current end time
let totalPages = 1; // New: Total number of pages
let currentSortOrder = 'DESC'; // Default sort order

const datetimeHeader = document.getElementById('datetimeHeader');
const sortIndicator = datetimeHeader.querySelector('.sort-indicator');

/**
 * Updates the pagination controls based on the total number of items.
 * @param {number} totalCount - The total number of items from the backend.
 */
function updatePaginationControls(totalCount) {
    const pageInfoSpan = document.getElementById('pageInfo');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageNumberInput = document.getElementById('pageNumberInput');

    totalPages = totalCount > 0 ? Math.ceil(totalCount / itemsPerPage) : 1;

    pageInfoSpan.textContent = `Page ${currentPage} / ${totalPages}`;
    pageNumberInput.value = currentPage;
    pageNumberInput.max = totalPages; // Set max value for the input

    prevPageBtn.disabled = (currentPage === 1);
    nextPageBtn.disabled = (currentPage >= totalPages);
}


/**
 * Fetches data from the backend API and displays it in the table.
 */
async function fetchDataAndDisplay() {
    const dataTableBody = document.querySelector('#dataTable tbody');
    dataTableBody.innerHTML = '<tr><td colspan="18" style="text-align: center;">Loading data...</td></tr>';

    const offset = (currentPage - 1) * itemsPerPage;
    let queryString = `/api/data?limit=${itemsPerPage}&offset=${offset}&orderBy=${currentSortOrder}`;
    if (currentStartDate) queryString += `&startDate=${currentStartDate}`;
    if (currentEndDate) queryString += `&endDate=${currentEndDate}`;
    if (currentStartTime) queryString += `&startTime=${currentStartTime}`;
    if (currentEndTime) queryString += `&endTime=${currentEndTime}`;

    console.log('Frontend Query String:', queryString);

    try {
        const response = await fetch(queryString);

        // --- 核心修改：处理认证和授权错误 ---
        // 1. 检查 401 Unauthorized 错误
        if (response.status === 401) {
            const errorMessage = "User not authenticated. Please log in.";
            console.error(errorMessage);
            // 在表格中显示错误信息，并提供登录链接
            dataTableBody.innerHTML = `<tr><td colspan="18" style="color: red; text-align: center;">${errorMessage} <a href="/login.html">Login here</a>.</td></tr>`;
            updatePaginationControls(0); // Reset pagination
            return;
        }

        // 2. 检查其他非成功响应 (如 403 Forbidden, 500 Internal Server Error)
        if (!response.ok) {
            // 后端现在应该总是返回 JSON 格式的错误，所以我们可以安全地解析它
            const errorData = await response.json().catch(() => ({ error: 'Could not parse error response from server.' }));
            throw new Error(`HTTP Error! Status: ${response.status}. Details: ${errorData.error || 'An unknown server error occurred.'}`);
        }
        // --- 修改结束 ---

        const result = await response.json();
        currentData = result.data;

        displayDataInTable(currentData);
        updatePaginationControls(result.totalCount);

    } catch (error) {
        console.error("Error fetching data:", error);
        let errorMessage = `Failed to load data. Details: ${error.message}`;
        dataTableBody.innerHTML = `<tr><td colspan="18" style="color: red; text-align: center;">${errorMessage}</td></tr>`;
        updatePaginationControls(0); // Reset pagination on error
    }
}

/**
 * Displays data in the web table.
 * @param {Array<Object>} data - The array of data to display.
 */
function displayDataInTable(data) {
    const dataTableBody = document.querySelector('#dataTable tbody');
    dataTableBody.innerHTML = ''; // Clear existing table content

    if (data && data.length > 0) {
        // Iterate through the data array, create table columns for each row
        data.forEach(item => {
            const row = dataTableBody.insertRow(); // Insert new row
            // Insert cells and set content, according to tbl_ndas1 schema
            row.insertCell().textContent = item.id;
            row.insertCell().textContent = item.pump_id !== null ? item.pump_id : 'N/A'; // Added pump_id
            // datetime_insert field may return in various formats, here it is assumed to be a valid date string or a format that can be parsed by Date()
            const datetimeInsert = item.datetime_insert ? (() => {
                const date = new Date(item.datetime_insert);
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                const hours = String(date.getUTCHours()).padStart(2, '0');
                const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            })() : 'N/A';
            row.insertCell().textContent = datetimeInsert;
            row.insertCell().textContent = item.va !== null ? item.va.toFixed(3) : 'N/A'; // Assuming it's a float, keep 3 decimal places
            row.insertCell().textContent = item.vb !== null ? item.vb.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.vc !== null ? item.vc.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.ia !== null ? item.ia.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.ib !== null ? item.ib.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.ic !== null ? item.ic.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.pres1 !== null ? item.pres1.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.pres2 !== null ? item.pres2.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.pres3 !== null ? item.pres3.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.vibx !== null ? item.vibx.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.viby !== null ? item.viby.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.vibz !== null ? item.vibz.toFixed(3) : 'N/A';
            row.insertCell().textContent = item.energy_consumption !== null ? item.energy_consumption.toFixed(3) : 'N/A'; // Changed from pt to energy_consumption
            row.insertCell().textContent = item.temperature !== null ? item.temperature.toFixed(3) : 'N/A'; // Added temperature
            row.insertCell().textContent = item.power !== null ? item.power.toFixed(3) : 'N/A'; // Added power
        });
    } else {
        // If there is no data, display a prompt message
        const row = dataTableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 18; // Make the cell span all columns (updated to 18)
        cell.style.textAlign = 'center';
        cell.textContent = "No data to display.";
    }
}

/**
 * Exports the given data array as a CSV file.
 * @param {Array<Object>} data - The array of data to export.
 * @param {string} filename - The name of the exported file.
 */
function exportDataToCsv(data, filename) {
    if (!data || data.length === 0) {
        console.error("No data to export!");
        return;
    }

    // Define the order and display names of CSV headers, consistent with table columns
    const headers = [
        { key: 'id', display: 'ID' },
        { key: 'pump_id', display: 'Pump ID' }, // Added pump_id
        { key: 'datetime_insert', display: 'Datetime Insert' },
        { key: 'va', display: 'Va' },
        { key: 'vb', display: 'Vb' },
        { key: 'vc', display: 'Vc' },
        { key: 'ia', display: 'Ia' },
        { key: 'ib', display: 'Ib' },
        { key: 'ic', display: 'Ic' },
        { key: 'pres1', display: 'Pres1' },
        { key: 'pres2', display: 'Pres2' },
        { key: 'pres3', display: 'Pres3' },
        { key: 'vibx', display: 'Vibx' },
        { key: 'viby', display: 'Viby' },
        { key: 'vibz', display: 'Vibz' },
        { key: 'energy_consumption', display: 'Energy Consumption' }, // Changed from Pt to Energy Consumption
        { key: 'temperature', display: 'Temperature' }, // Added temperature
        { key: 'power', display: 'Power' } // Added power
    ];

    const csvRows = [];

    // Add header row
    csvRows.push(headers.map(h => `"${h.display}"`).join(','));

    // Iterate through data rows, convert each object's value to CSV format
    for (const row of data) {
        const values = headers.map(h => {
            let val = row[h.key];

            // Handle datetime_insert field
            if (h.key === 'datetime_insert') {
                val = val ? (() => {
                    const date = new Date(val);
                    const year = date.getUTCFullYear();
                    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                    const day = String(date.getUTCDate()).padStart(2, '0');
                    const hours = String(date.getUTCHours()).padStart(2, '0');
                    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                })() : '';
            }
            // Handle float types, keep 3 decimal places
            else if (['va', 'vb', 'vc', 'ia', 'ib', 'ic', 'pres1', 'pres2', 'pres3', 'vibx', 'viby', 'vibz', 'energy_consumption', 'temperature', 'power'].includes(h.key)) { // Updated to include new float columns
                val = val !== null ? val.toFixed(3) : '';
            }

            // Convert value to string, handle null/undefined as empty string
            val = (val === null || val === undefined) ? '' : String(val);

            // Handle strings containing commas, double quotes, or newlines (CSV standard escaping)
            if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        });
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n'); // Join all rows with newline characters

    // Create Blob object and specify UTF-8 encoding and BOM (Byte Order Mark)
    // BOM is very important for ensuring Excel displays Chinese correctly
    const blob = new Blob(['\ufeff', csvString], { type: 'text/csv;charset=utf-8;' });

    // Create a hidden download link and trigger the download
    const link = document.createElement('a');
    if (link.download !== undefined) { // Check if the browser supports the download attribute
        const url = URL.createObjectURL(blob); // Create a URL pointing to the Blob
        link.setAttribute('href', url);
        link.setAttribute('download', filename); // Set the download file name
        link.style.visibility = 'hidden'; // Hide the link
        document.body.appendChild(link); // Add the link to the DOM
        link.click(); // Simulate clicking the link
        document.body.removeChild(link); // Remove the link from the DOM
        URL.revokeObjectURL(url); // Release the URL object to save memory
    }
}

// Function to update the sort indicator
function updateSortIndicator() {
    if (currentSortOrder === 'DESC') {
        sortIndicator.textContent = '▼'; // Down arrow for descending
    } else {
        sortIndicator.textContent = '▲'; // Up arrow for ascending
    }
}

// Execute data fetching and event listener setup after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('startDate'); // Changed from searchDateInput to startDateInput
    const endDateInput = document.getElementById('endDate');     // New: Get end date input box
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const searchBtn = document.getElementById('searchBtn');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const pageNumberInput = document.getElementById('pageNumberInput');
    const goToPageBtn = document.getElementById('goToPageBtn');

    fetchDataAndDisplay(); // Fetch and display data when the page loads

    // Add click event listener for the export button
    document.getElementById('exportCsvBtn').addEventListener('click', async () => {
        console.log("Preparing to export all data...");
        try {
            // Send request to backend to get all data (without limit and offset parameters)
            // If there is a current search date and time, also pass it to the export request
            let exportQueryString = '/api/data?'; // Start with ?, convenient for splicing later
            const params = [];

            if (currentStartDate) { // Changed from currentSearchDate to currentStartDate
                params.push(`startDate=${currentStartDate}`);
            }
            if (currentEndDate) { // New: Add currentEndDate to export query
                params.push(`endDate=${currentEndDate}`);
            }
            if (currentStartTime) {
                params.push(`startTime=${currentStartTime}`);
            }
            if (currentEndTime) {
                params.push(`endTime=${currentEndTime}`);
            }

            if (params.length > 0) {
                exportQueryString += params.join('&');
            } else {
                // If there are no search conditions, just request /api/data
                exportQueryString = '/api/data';
            }

            // --- 新增：打印导出查询字符串 ---
            console.log('Export Query String:', exportQueryString);
            // --- 新增结束 ---

            const response = await fetch(exportQueryString);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP Error! Status code: ${response.status}. Error details: ${errorData.error || 'Unknown error from server'}`);
            }
            const result = await response.json(); // Get results containing data and totalCount
            const allData = result.data; // Extract all data

            if (allData.length > 0) {
                exportDataToCsv(allData, 'mysql_data_export.csv');
                console.log(`Successfully exported ${allData.length} records to CSV.`);
            } else {
                alert("No data to export!");
                console.warn("No data to export.");
            }
        } catch (error) {
            console.error("Error exporting data:", error);
            alert(`Failed to export data. Error details: ${error.message}`);
        }
    });

    // Add click event listener for the previous page button
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchDataAndDisplay();
        }
    });

    // Add click event listener for the next page button
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        currentPage++; // Always try to increment the page number, fetchDataAndDisplay will determine if there is a next page
        fetchDataAndDisplay();
    });

    // Add click event listener for the search button
    searchBtn.addEventListener('click', () => {
        currentStartDate = startDateInput.value; // Changed from searchDateInput to startDateInput
        currentEndDate = endDateInput.value;     // New: Get the value of the end date input box
        currentStartTime = startTimeInput.value;
        currentEndTime = endTimeInput.value;
        currentPage = 1; // Reset to the first page when searching
        fetchDataAndDisplay(); // Re-fetch and display data
    });

    // Add click event listener for the clear search button
    clearSearchBtn.addEventListener('click', () => {
        startDateInput.value = ''; // Changed from searchDateInput to startDateInput
        endDateInput.value = '';   // New: Clear end date input box
        startTimeInput.value = '';
        endTimeInput.value = '';
        currentStartDate = '';     // Changed from currentSearchDate to currentStartDate
        currentEndDate = '';       // New: Clear search end date
        currentStartTime = '';
        currentEndTime = '';
        currentPage = 1;
        fetchDataAndDisplay();
    });

    // New: Add click event listener for the jump button
    goToPageBtn.addEventListener('click', () => {
        const pageNumber = parseInt(pageNumberInput.value);
        if (isNaN(pageNumber) || pageNumber < 1) {
            alert('Please enter a valid page number (a number greater than or equal to 1).');
            return;
        }
        // If the entered page number is greater than the known maximum number of pages, set it to the maximum number of pages
        // No additional handling for currentPage > totalPages is needed here, as fetchDataAndDisplay handles it internally
        // But a prompt can be added to let the user know if the input is too large
        if (pageNumber > totalPages && totalPages > 0) {
             alert(`Entered page number ${pageNumber} exceeds total pages ${totalPages}, will jump to the last page.`);
             currentPage = totalPages;
        } else {
            currentPage = pageNumber; // Set to the specified page number
        }

        fetchDataAndDisplay();    // Re-fetch and display data
    });

    // Function to update the sort indicator
    function updateSortIndicator() {
        if (currentSortOrder === 'DESC') {
            sortIndicator.textContent = '▼'; // Down arrow for descending
        } else {
            sortIndicator.textContent = '▲'; // Up arrow for ascending
        }
    }

    // Add event listener to the header
    datetimeHeader.addEventListener('click', () => {
        // Toggle sort order
        currentSortOrder = currentSortOrder === 'DESC' ? 'ASC' : 'DESC';

        // Update the indicator
        updateSortIndicator();

        // Reset to the first page and fetch data with the new sort order
        currentPage = 1; // Assuming you have a currentPage variable
        fetchDataAndDisplay(); // Call your data fetching function
    });
});
