import { fetchFileData } from "../utils/googleDriveUtils";

// Process client data with dynamic folder
export const processClientData = async (
  authToken: string,
  selectedFolders: { clients: string },
  onProgress: (status: string) => void
) => {
  const folderId = selectedFolders.clients;
  if (!folderId) {
    throw new Error("No client folder selected");
  }

  const clientData = [];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

  const formatLocation = (location: string) => {
    if (!location) return "";
    return location.toLowerCase().includes("school") ? "S" : "H";
  };

  const parseTimeSlot = (timeStr: string, location: string) => {
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
      throw new Error(`Error parsing time slot: ${timeStr}, Error: ${error}`);
    }
  };

  interface TimeSlot {
    start: Date;
    end: Date;
    location: string;
  }

  const findScheduleBreaks = (timeSlots: TimeSlot[]) => {
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
      onProgress(`Processing file: ${file.name}...`); // Send progress update
      const data = await fetchFileData(authToken, file);

      const initialsRow = data.find((row: any[]) => row[0] === "Client Initials");
      const name = initialsRow?.[1]?.trim() || "Unknown";

      const timeOffRow = data.find((row: any[]) =>
        row[0]?.includes("Planned Vacation") || row[0]?.includes("Time Off")
      );
      const timeOff = timeOffRow?.[1]?.trim() || "None";

      const headerRowIndex = data.findIndex((row: any[]) =>
        row[1] === "Home/School" && row.includes("Mon")
      );

      if (headerRowIndex === -1) {
        console.warn(`No availability data found in file: ${file.name}`);
        throw new Error(`No availability data found in file: ${file.name}`);
      }

      const rowData = createEmptyRowData();
      rowData.Name = name;

      const headerRow = data[headerRowIndex];
      const dayIndices = new Map(
        days.map(day => [
          day,
          headerRow.findIndex((cell: string | undefined) =>
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
      throw new Error(`Error processing client file (${file.name}): ${error}`);
    }
  }

  return clientData;
};
