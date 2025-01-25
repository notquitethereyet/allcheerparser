import { fetchFileData, convertTo24Hr } from "../utils/googleDriveUtils";


export   const processStaffData = async (authToken: string, selectedFolders: { therapists: string; supervisors: string }) => {
    console.log('Starting processStaffData with folders:', selectedFolders);
    const staffData: Record<string, any>[] = [];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    // Helper function to process a folder
    const processFolder = async (folderId: string, isSupervisor: boolean) => {
      console.log(`Starting to process folder: ${folderId}, isSupervisor: ${isSupervisor}`);

      if (!folderId) {
        console.warn(`Skipping folder processing: No folder ID provided for ${isSupervisor ? 'supervisors' : 'therapists'}`);
        return;
      }

      console.log(`Fetching files from folder: ${folderId}`);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&pageSize=100`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      if (!response.ok) {
        console.error(`Failed to fetch files from folder: ${response.statusText}`);
        throw new Error(`Failed to fetch files from folder: ${response.statusText}`);
      }

      const { files } = await response.json();
      console.log(`Found ${files.length} files in folder ${folderId}`);

      for (const file of files) {
        try {
          console.log(`Processing file: ${file.name} (${file.id})`);
          const data = await fetchFileData(authToken, file);

          // Locate the header row
          const headerRowIndex = data.findIndex((row: any[]) =>
            row?.includes("Mon") && row?.includes("Tue")
          );
          if (headerRowIndex === -1) {
            console.warn(`No valid headers found in file: ${file.name}`);
            continue;
          }
          console.log(`Found header row at index ${headerRowIndex}`);

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
          console.log(`Extracted name: ${name}`);

          // Extract "Time Off" from rows containing "vacation"
          const vacationRowIndex = data.findIndex((row: any[]) =>
            row[0]?.toLowerCase()?.includes("vacation")
          );
          const timeOff =
            vacationRowIndex !== -1
              ? data[vacationRowIndex][1]?.trim() || "None"
              : "None";
          console.log(`Extracted time off: ${timeOff}`);

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

          console.log(`Adding processed data for ${name}`);
          staffData.push(rowData);
        } catch (error) {
          console.error(`Error processing staff file (${file.name}):`, error);
        }
      }
      console.log(`Finished processing folder: ${folderId}`);
    };

    console.log('About to process therapists folder:', selectedFolders.therapists);
    if (selectedFolders.therapists) {
      await processFolder(selectedFolders.therapists, false);
    }

    console.log('About to process supervisors folder:', selectedFolders.supervisors);
    if (selectedFolders.supervisors) {
      await processFolder(selectedFolders.supervisors, true);
    }

    console.log(`Finished processing all folders. Total staff entries: ${staffData.length}`);
    return staffData;
  };