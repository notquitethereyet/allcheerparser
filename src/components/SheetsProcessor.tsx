import { useState, useContext } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AuthContext } from "../App";

const FOLDER_IDS = {
  clients: "1NiL7MzpYZTS1cLs6E2Ia9Bal4i64Xz03",
  therapists: "1d1z_92uUy_Y4VZkg27IQdJTchQtiqXC2",
  supervisors: "1EF_cfloGh2NF8TLctBhFr8mhfLFb68ca",
};

// Utility function to fetch and parse file content
const fileCache = new Map<string, any>(); // Cache to store fetched files

// Utility function to fetch and cache file content
const fetchFileData = async (authToken: string, file: any) => {
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



// Process staff data
const processStaffData = async (authToken: string) => {
  const staffData: Record<string, any>[] = [];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Helper function to process a folder
  const processFolder = async (folderId: string, isSupervisor: boolean) => {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const { files } = await response.json();
    for (const file of files) {
      try {
        const data = await fetchFileData(authToken, file);

        // Locate the header row
        const headerRowIndex = data.findIndex((row: any[]) =>
          row.includes("Mon") && row.includes("Tue")
        );
        if (headerRowIndex === -1) {
          console.warn(`No valid headers found in file: ${file.name}`);
          continue;
        }

        const headers = data[headerRowIndex];
        const rows = data.slice(headerRowIndex + 1);

        // Extract the name from a row containing "initial"
        const nameRowIndex = data.findIndex((row: any[]) =>
          row[0]?.toLowerCase()?.includes("initial")
        );
        const name =
          nameRowIndex !== -1
            ? data[nameRowIndex][1]?.trim()
            : file.name.match(/_(\w+)\./)?.[1] || "Unknown";

        // Extract "Time Off" from rows containing "vacation"
        const vacationRowIndex = data.findIndex((row: any[]) =>
          row[0]?.toLowerCase()?.includes("vacation")
        );
        const timeOff =
          vacationRowIndex !== -1
            ? data[vacationRowIndex][1]?.trim() || "None"
            : "None";

        const rowData: Record<string, any> = {
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
            .filter((row: any[]) => row[dayIndex] === true || row[dayIndex] === "TRUE")
            .map((row: any[]) => row[0]); // Time range column

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

  // Process both therapists and supervisors
  await processFolder(FOLDER_IDS.therapists, false);
  await processFolder(FOLDER_IDS.supervisors, true);

  return staffData;
};

const convertTo24Hr = (timeStr: string): string => {
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



// Process client data
const processClientData = async (authToken: string) => {
  const clientData: Record<string, any>[] = [];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Create fixed column order
  const createColumns = () => {
    const columns = ["Name"];
    days.forEach(day => {
      columns.push(
        `AM ${day}`,
        `AM ${day} Location`,
        `Pref Therapist AM ${day}`, // Therapist for AM
        `PM ${day}`,
        `PM ${day} Location`,
        `Pref Therapist PM ${day}` // Therapist for PM
      );
    });
    columns.push("Time Off");
    return columns;
  };

  // Create empty row data with all columns
  const createEmptyRowData = () => {
    const columns = createColumns();
    return Object.fromEntries(columns.map(col => [col, ""]));
  };

  const formatLocation = (location: string): string => {
    if (!location) return "";
    return location.toLowerCase().includes("school") ? "S" : "H";
  };

  interface TimeSlot {
    start: Date;
    end: Date;
    location: string;
  }

  const parseTimeSlot = (timeStr: string, location: string): TimeSlot | null => {
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

  const findScheduleBreaks = (timeSlots: TimeSlot[]): { am: [string, string], pm: [string, string] } => {
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

      const formatTime = (date: Date) => 
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

  const processFolder = async (folderId: string) => {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const { files } = await response.json();
    for (const file of files) {
      try {
        const data = await fetchFileData(authToken, file);

        const initialsRow = data.find((row: any[]) => 
          row[0] === "Client Initials"
        );
        const name = initialsRow?.[1]?.trim() || "Unknown";

        const timeOffRow = data.find((row: any[]) =>
          row[0]?.includes("Planned Vacation") || 
          row[0]?.includes("Time Off")
        );
        const timeOff = timeOffRow?.[1]?.trim() || "None";

        const headerRowIndex = data.findIndex((row: any[]) =>
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
            headerRow.findIndex((cell: string) => 
              cell?.includes(day.slice(0, 3))
            )
          ])
        );

        days.forEach(day => {
          const dayIndex = dayIndices.get(day);
          if (dayIndex === -1 || dayIndex === undefined) {
            return;
          }

          const timeSlots: TimeSlot[] = [];

          for (let i = headerRowIndex + 1; i < data.length; i++) {
            const row = data[i];
            if (!row[0] || !row[0].includes(":")) continue;

            const timeStr = row[0];
            const location = row[1]?.trim() || "";
            const isAvailable = row[dayIndex] === true;

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
          rowData[`Pref Therapist AM ${day}`] = ""; // Blank cell for AM therapist
          rowData[`PM ${day}`] = pmTime;
          rowData[`PM ${day} Location`] = pmLocation;
          rowData[`Pref Therapist PM ${day}`] = ""; // Blank cell for PM therapist
        });

        rowData["Time Off"] = timeOff;
        clientData.push(rowData);

      } catch (error) {
        console.error(`Error processing client file (${file.name}):`, error);
      }
    }
  };

  await processFolder(FOLDER_IDS.clients);
  
  // Create worksheet with columns in fixed order
  const columns = createColumns();
  const orderedData = clientData.map(row => 
    Object.fromEntries(columns.map(col => [col, row[col] || ""]))
  );
  
  return orderedData;
};

// Process address data
const processAddressData = async (authToken: string) => {
  const addressData: Record<string, any>[] = [];

  const processFolder = async (folderId: string, type: string) => {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const { files } = await response.json();
    for (const file of files) {
      try {
        const data = await fetchFileData(authToken, file);

        // Locate rows containing initials and addresses
        const initialsRowIndex = data.findIndex((row: any[]) =>
          row[0]?.toLowerCase()?.includes("initial")
        );
        const initials =
          initialsRowIndex !== -1
            ? data[initialsRowIndex][1]?.trim() || "Unknown"
            : "Unknown";

        const addressRows = data.filter((row: any[]) =>
          row[0]?.toLowerCase()?.includes("address")
        );

        addressRows.forEach((row: any[]) => {
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

            // For staff, include address without suffix
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

  // Process clients and staff folders
  await processFolder(FOLDER_IDS.clients, "Client");
  await processFolder(FOLDER_IDS.therapists, "Staff");
  await processFolder(FOLDER_IDS.supervisors, "Staff");

  return addressData;
};



// // Processing button component
// const ProcessingButton = ({
//   onClick,
//   isLoading,
//   children,
// }: {
//   onClick: () => void;
//   isLoading: boolean;
//   children: React.ReactNode;
// }) => (
//   <button
//     onClick={onClick}
//     disabled={isLoading}
//     className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors w-full md:w-auto"
//   >
//     {isLoading ? "Processing..." : children}
//   </button>
// );

// Processor component
const Processor = ({ processFunction, title }: { processFunction: any; title: string }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const auth = useContext(AuthContext);

  const handleProcess = async () => {
    if (!auth || !auth.accessToken) {
      setStatus('Error: User is not authenticated.');
      return;
    }
    setIsLoading(true);
    setStatus(`Processing ${title.toLowerCase()}...`);

    try {
      const data = await processFunction(auth.accessToken);
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(workbook, worksheet, title);

      const excelData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelData], { type: 'application/octet-stream' });
      saveAs(blob, `${title}_Processed.xlsx`);

      setStatus(`${title} processing complete!`);
    } catch (error) {
      console.error(`Error processing ${title.toLowerCase()}:`, error);
      setStatus(`Error processing ${title.toLowerCase()}: ${(error as any).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold text-primary mb-4">{title}</h2>
      <button
        onClick={handleProcess}
        disabled={isLoading}
        className={`rounded-lg px-6 py-3 font-semibold text-white ${
          isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary hover:bg-highlight-primary'
        }`}
      >
        {isLoading ? 'Processing...' : `Process ${title}`}
      </button>
      {status && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {status}
        </div>
      )}
    </div>
  );
};


// Cache clearing button component
const ClearCacheButton = () => {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Clear Cache</h2>
      <button
        onClick={() => {
          clearCache();
          alert("Cache cleared successfully!");
        }}
        className="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition-colors w-full md:w-auto"
      >
        Clear Cache
      </button>
    </div>
  );
};

const SheetsProcessor = () => {
  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-primary text-center mb-6">
            Schedule Data Processor
          </h1>
          <div className="space-y-8">
            <Processor title="Clients" processFunction={processClientData} />
            <Processor title="Staff" processFunction={processStaffData} />
            <Processor title="Addresses" processFunction={processAddressData} />
            <ClearCacheButton />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SheetsProcessor;
