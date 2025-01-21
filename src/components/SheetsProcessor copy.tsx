import { useState, useContext, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AuthContext } from "../App";

// Cache to store fetched files
const fileCache = new Map();

// Utility function to fetch and cache file content
const fetchFileData = async (authToken, file) => {
  if (fileCache.has(file.id)) {
    console.log(`Cache hit for file: ${file.name}`);
    return fileCache.get(file.id);
  }

  const url =
    file.mimeType === "application/vnd.google-apps.spreadsheet"
      ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
      : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${file.name}`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  console.log(`Fetched and cached file: ${file.name}`);
  fileCache.set(file.id, data); // Cache the parsed data
  return data;
};

// Clear cache when necessary
const clearCache = () => {
  fileCache.clear();
  console.log("Cache cleared.");
};

const PARENT_FOLDER_ID = "10CSN3c8UjyNzt7haNVlBkQthVPxzFTAf";

// Utility function to fetch folders
const fetchFolders = async (authToken) => {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${PARENT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder'`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  
  const { files } = await response.json();
  return files.map(file => ({
    id: file.id,
    name: file.name
  }));
};

// FolderSelector Component
const FolderSelector = ({ 
  folders, 
  selectedFolder, 
  onSelect, 
  label,
  disabled 
}) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {label}
    </label>
    <select
      value={selectedFolder || ""}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      className="w-full p-2 border rounded-md bg-white disabled:bg-gray-100"
    >
      <option value="">Select a folder</option>
      {folders.map(folder => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </select>
  </div>
);

// Processor component with folder selection
const Processor = ({ 
  processFunction, 
  title, 
  selectedFolder,
  disabled 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const auth = useContext(AuthContext);

  const handleProcess = async () => {
    if (!auth?.accessToken) {
      setStatus('Error: User is not authenticated.');
      return;
    }
    if (!selectedFolder) {
      setStatus('Error: Please select a folder first.');
      return;
    }

    setIsLoading(true);
    setStatus(`Processing ${title.toLowerCase()}...`);

    try {
      const data = await processFunction(auth.accessToken, selectedFolder);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, title);

      const excelData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelData], { type: 'application/octet-stream' });
      saveAs(blob, `${title}_Processed.xlsx`);

      setStatus(`${title} processing complete!`);
    } catch (error) {
      console.error(`Error processing ${title.toLowerCase()}:`, error);
      setStatus(`Error processing ${title.toLowerCase()}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold text-primary mb-4">{title}</h2>
      <button
        onClick={handleProcess}
        disabled={isLoading || disabled || !selectedFolder}
        className={`rounded-lg px-6 py-3 font-semibold text-white ${
          isLoading || disabled || !selectedFolder
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-primary hover:bg-highlight-primary'
        }`}
      >
        {isLoading ? 'Processing...' : `Process ${title}`}
      </button>
      {status && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            status.includes('Error') 
              ? 'bg-red-100 text-red-700' 
              : 'bg-green-100 text-green-700'
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
};

const SheetsProcessor = () => {
  const auth = useContext(AuthContext);
  const [folders, setFolders] = useState([]);
  const [selectedFolders, setSelectedFolders] = useState({
    clients: '',
    therapists: '',
    supervisors: ''
  });
  const [isLoadingFolders, setIsLoadingFolders] = useState(true);
  const [folderError, setFolderError] = useState('');

  useEffect(() => {
    const loadFolders = async () => {
      if (!auth?.accessToken) return;
      
      try {
        const folderList = await fetchFolders(auth.accessToken);
        setFolders(folderList);
      } catch (error) {
        setFolderError('Error loading folders: ' + error.message);
      } finally {
        setIsLoadingFolders(false);
      }
    };

    loadFolders();
  }, [auth?.accessToken]);

  // Process client data with dynamic folder
  const processClientData = async (authToken, folderId) => {
    if (!folderId) {
      throw new Error('No client folder selected');
    }
  
    const clientData = [];
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
    // Create fixed column order
    const createColumns = () => {
      const columns = ["Name"];
      days.forEach(day => {
        columns.push(
          `AM ${day}`,
          `AM ${day} Location`,
          `Pref Therapist AM ${day}`,
          `PM ${day}`,
          `PM ${day} Location`,
          `Pref Therapist PM ${day}`
        );
      });
      columns.push("Time Off");
      return columns;
    };
  
    const createEmptyRowData = () => {
      const columns = createColumns();
      return Object.fromEntries(columns.map(col => [col, ""]));
    };
  
    const formatLocation = (location) => {
      if (!location) return "";
      return location.toLowerCase().includes("school") ? "S" : "H";
    };
  
    const parseTimeSlot = (timeStr, location) => {
      try {
        const [start, end] = timeStr.split(" - ").map(t => {
          const timeOnly = t.replace(/am|pm/gi, "").trim();
          const [hours, minutes] = timeOnly.split(":").map(Number);
          const isPM = t.toLowerCase().includes("pm") && hours !== 12;
          const date = new Date();
          date.setHours(isPM ? hours + 12 : hours, minutes, 0, 0);
          return date;
        });
        return { start, end, location };
      } catch (error) {
        console.error(`Error parsing time slot: ${timeStr}`, error);
        return null;
      }
    };
  
    const findScheduleBreaks = (timeSlots) => {
      if (!timeSlots.length) return { am: ["", ""], pm: ["", ""] };
  
      timeSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  
      let maxBreak = 0;
      let breakIndex = -1;
  
      for (let i = 0; i < timeSlots.length - 1; i++) {
        const breakDuration = timeSlots[i + 1].start.getTime() - timeSlots[i].end.getTime();
        if (breakDuration > maxBreak) {
          maxBreak = breakDuration;
          breakIndex = i;
        }
      }
  
      if (maxBreak > 60 * 60 * 1000) {
        const amSlots = timeSlots.slice(0, breakIndex + 1);
        const pmSlots = timeSlots.slice(breakIndex + 1);
  
        const formatTime = (date) => 
          `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  
        return {
          am: amSlots.length ? [
            `${formatTime(amSlots[0].start)}-${formatTime(amSlots[amSlots.length - 1].end)}`,
            formatLocation(amSlots[0].location)
          ] : ["", ""],
          pm: pmSlots.length ? [
            `${formatTime(pmSlots[0].start)}-${formatTime(pmSlots[pmSlots.length - 1].end)}`,
            formatLocation(pmSlots[0].location)
          ] : ["", ""]
        };
      }
  
      const firstSlot = timeSlots[0];
      const lastSlot = timeSlots[timeSlots.length - 1];
      const timeRange = `${String(firstSlot.start.getHours()).padStart(2, '0')}:${String(firstSlot.start.getMinutes()).padStart(2, '0')}-${String(lastSlot.end.getHours()).padStart(2, '0')}:${String(lastSlot.end.getMinutes()).padStart(2, '0')}`;
      
      return firstSlot.start.getHours() < 12 
        ? { am: [timeRange, formatLocation(firstSlot.location)], pm: ["", ""] }
        : { am: ["", ""], pm: [timeRange, formatLocation(firstSlot.location)] };
    };
  
    // Fetch files from the selected folder
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
  
    if (!response.ok) {
      throw new Error(`Failed to fetch files from client folder: ${response.statusText}`);
    }
  
    const { files } = await response.json();
    
    for (const file of files) {
      try {
        const data = await fetchFileData(authToken, file);
  
        const initialsRow = data.find(row => 
          row[0] === "Client Initials"
        );
        const name = initialsRow?.[1]?.trim() || "Unknown";
  
        const timeOffRow = data.find((row) =>
          row[0]?.includes("Planned Vacation") || 
          row[0]?.includes("Time Off")
        );
        const timeOff = timeOffRow?.[1]?.trim() || "None";
  
        const headerRowIndex = data.findIndex((row) =>
          row[1] === "Home/School" && row.includes("Mon")
        );
        
        if (headerRowIndex === -1) {
          console.warn(`No availability data found in file: ${file.name}`);
          continue;
        }
  
        const rowData = createEmptyRowData();
        rowData.Name = name;
  
        const headerRow = data[headerRowIndex];
        const dayIndices = new Map(
          days.map(day => [
            day,
            headerRow.findIndex((cell) => 
              cell?.includes(day.slice(0, 3))
            )
          ])
        );
  
        days.forEach(day => {
          const dayIndex = dayIndices.get(day);
          if (dayIndex === -1 || dayIndex === undefined) {
            return;
          }
  
          const timeSlots = [];
  
          for (let i = headerRowIndex + 1; i < data.length; i++) {
            const row = data[i];
            if (!row[0] || !row[0].includes(":")) continue;
  
            const timeStr = row[0];
            const location = row[1]?.trim() || "";
            const isAvailable = row[dayIndex] === true || row[dayIndex] === "TRUE";
  
            if (isAvailable) {
              const slot = parseTimeSlot(timeStr, location);
              if (slot) {
                timeSlots.push(slot);
              }
            }
          }
  
          const { am: [amTime, amLocation], pm: [pmTime, pmLocation] } = findScheduleBreaks(timeSlots);
  
          rowData[`AM ${day}`] = amTime;
          rowData[`AM ${day} Location`] = amLocation;
          rowData[`Pref Therapist AM ${day}`] = "";
          rowData[`PM ${day}`] = pmTime;
          rowData[`PM ${day} Location`] = pmLocation;
          rowData[`Pref Therapist PM ${day}`] = "";
        });
  
        rowData["Time Off"] = timeOff;
        clientData.push(rowData);
  
      } catch (error) {
        console.error(`Error processing client file (${file.name}):`, error);
      }
    }
    
    // Create worksheet with columns in fixed order
    const columns = createColumns();
    const orderedData = clientData.map(row => 
      Object.fromEntries(columns.map(col => [col, row[col] || ""]))
    );
    
    return orderedData;
  };

  // Process staff data with dynamic folders
  const processStaffData = async (authToken, selectedFolders) => {
    const staffData = [];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  
    // Helper function to process a folder
    const processFolder = async (folderId, isSupervisor) => {
      if (!folderId) {
        console.warn(`Skipping folder processing: No folder ID provided for ${isSupervisor ? 'supervisors' : 'therapists'}`);
        return;
      }
  
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
  
      if (!response.ok) {
        throw new Error(`Failed to fetch files from folder: ${response.statusText}`);
      }
  
      const { files } = await response.json();
      for (const file of files) {
        try {
          const data = await fetchFileData(authToken, file);
  
          // Locate the header row
          const headerRowIndex = data.findIndex((row) =>
            row?.includes("Mon") && row?.includes("Tue")
          );
          if (headerRowIndex === -1) {
            console.warn(`No valid headers found in file: ${file.name}`);
            continue;
          }
  
          const headers = data[headerRowIndex];
          const rows = data.slice(headerRowIndex + 1);
  
          // Extract the name from a row containing "initial"
          const nameRowIndex = data.findIndex((row) =>
            row[0]?.toLowerCase()?.includes("initial")
          );
          const name =
            nameRowIndex !== -1
              ? data[nameRowIndex][1]?.trim()
              : file.name.match(/_(\w+)\./)?.[1] || "Unknown";
  
          // Extract "Time Off" from rows containing "vacation"
          const vacationRowIndex = data.findIndex((row) =>
            row[0]?.toLowerCase()?.includes("vacation")
          );
          const timeOff =
            vacationRowIndex !== -1
              ? data[vacationRowIndex][1]?.trim() || "None"
              : "None";
  
          const rowData = {
            Name: name,
            ProgramSupervisor: isSupervisor,
          };
  
          days.forEach((day) => {
            const dayIndex = headers.indexOf(day);
            if (dayIndex === -1) {
              rowData[day] = "Unavailable";
              return;
            }
  
            // Filter rows where the column for the day is "true"
            const availableSlots = rows
              .filter((row) => row[dayIndex] === true || row[dayIndex] === "TRUE")
              .map((row) => row[0]); // Time range column
  
            if (availableSlots.length > 0) {
              // Extract start and end times
              const startTime = availableSlots[0].split(" - ")[0];
              const endTime = availableSlots[availableSlots.length - 1].split(" - ")[1];
              rowData[day] = `${convertTo24Hr(startTime)} - ${convertTo24Hr(endTime)}`;
            } else {
              rowData[day] = "Unavailable";
            }
          });
  
          // Append "Time Off" at the end
          rowData["Time Off"] = timeOff;
          staffData.push(rowData);
        } catch (error) {
          console.error(`Error processing staff file (${file.name}):`, error);
        }
      }
    };
  
    // Process therapists folder if selected
    if (selectedFolders.therapists) {
      await processFolder(selectedFolders.therapists, false);
    }
  
    // Process supervisors folder if selected
    if (selectedFolders.supervisors) {
      await processFolder(selectedFolders.supervisors, true);
    }
  
    return staffData;
  };
  
  // Helper function for time conversion
  const convertTo24Hr = (timeStr) => {
    const [time, modifier] = timeStr.trim().split(/(AM|PM)/i);
    let [hours, minutes] = time.split(":").map(Number);
  
    if (modifier?.toUpperCase() === "PM" && hours < 12) {
      hours += 12;
    }
    if (modifier?.toUpperCase() === "AM" && hours === 12) {
      hours = 0;
    }
  
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  // Process address data with dynamic folders
const processAddressData = async (authToken, selectedFolders) => {
  if (!selectedFolders.clients && !selectedFolders.therapists && !selectedFolders.supervisors) {
    throw new Error('No folders selected for address processing');
  }

  const addressData = [];

  const processFolder = async (folderId, type) => {
    if (!folderId) {
      console.warn(`Skipping address processing: No folder ID provided for ${type}`);
      return;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch files from ${type} folder: ${response.statusText}`);
    }

    const { files } = await response.json();
    for (const file of files) {
      try {
        const data = await fetchFileData(authToken, file);

        // Locate rows containing initials and addresses
        const initialsRowIndex = data.findIndex((row) =>
          row[0]?.toLowerCase()?.includes("initial")
        );
        const initials =
          initialsRowIndex !== -1
            ? data[initialsRowIndex][1]?.trim() || "Unknown"
            : file.name.match(/_(\w+)\./)?.[1] || "Unknown";

        // Find all address rows
        const addressRows = data.filter((row) =>
          row[0]?.toLowerCase()?.includes("address")
        );

        addressRows.forEach((row) => {
          const isSchoolAddress = row[0]?.toLowerCase()?.includes("school");
          const address = row[1]?.trim();

          if (address) {
            // For clients, include suffix (H or S)
            if (type === "Client") {
              const addressType = isSchoolAddress ? "S" : "H";
              addressData.push({
                Initials: `${initials}${addressType}`,
                Type: type,
                Address: address,
              });
            }

            // For staff, include address without suffix and only home address
            if (type === "Staff" && !isSchoolAddress) {
              addressData.push({
                Initials: initials,
                Type: type,
                Address: address,
              });
            }
          }
        });

      } catch (error) {
        console.error(`Error processing address file (${file.name}):`, error);
      }
    }
  };

  // Process all selected folders
  const folderProcessingPromises = [];
  
  if (selectedFolders.clients) {
    folderProcessingPromises.push(processFolder(selectedFolders.clients, "Client"));
  }
  
  if (selectedFolders.therapists) {
    folderProcessingPromises.push(processFolder(selectedFolders.therapists, "Staff"));
  }
  
  if (selectedFolders.supervisors) {
    folderProcessingPromises.push(processFolder(selectedFolders.supervisors, "Staff"));
  }

  // Wait for all folder processing to complete
  await Promise.all(folderProcessingPromises);

  // Sort the address data by Type (Clients first, then Staff) and then by Initials
  return addressData.sort((a, b) => {
    if (a.Type === b.Type) {
      return a.Initials.localeCompare(b.Initials);
    }
    return a.Type === "Client" ? -1 : 1;
  });
};

  if (isLoadingFolders) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="text-xl">Loading folders...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-primary text-center mb-6">
            Schedule Data Processor
          </h1>
          
          {folderError && (
            <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
              {folderError}
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Folder Selection</h2>
            <div className="space-y-4">
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.clients}
                onSelect={(id) => setSelectedFolders(prev => ({ ...prev, clients: id }))}
                label="Select Clients Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.therapists}
                onSelect={(id) => setSelectedFolders(prev => ({ ...prev, therapists: id }))}
                label="Select Therapists Folder"
                disabled={isLoadingFolders}
              />
              <FolderSelector
                folders={folders}
                selectedFolder={selectedFolders.supervisors}
                onSelect={(id) => setSelectedFolders(prev => ({ ...prev, supervisors: id }))}
                label="Select Supervisors Folder"
                disabled={isLoadingFolders}
              />
            </div>
          </div>

          <div className="space-y-8">
            <Processor 
              title="Clients" 
              processFunction={processClientData}
              selectedFolder={selectedFolders.clients}
              disabled={isLoadingFolders}
            />
            <Processor 
              title="Staff" 
              processFunction={processStaffData}
              selectedFolder={selectedFolders.therapists}
              disabled={isLoadingFolders}
            />
            <Processor 
              title="Addresses" 
              processFunction={processAddressData}
              selectedFolder={selectedFolders}
              disabled={isLoadingFolders}
            />
            
            {/* Cache clearing button */}
            <div className="mt-8 pt-8 border-t">
              <h2 className="text-xl font-semibold mb-4">Cache Management</h2>
              <button
                onClick={() => {
                  clearCache();
                  alert("Cache cleared successfully!");
                }}
                className="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition-colors"
              >
                Clear Cache
              </button>
              <p className="mt-2 text-sm text-gray-600">
                Clear the cache if you want to fetch fresh data from Google Drive.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetsProcessor;